import re
import pandas as pd
import pickle
import os
import csv
import json
import datetime
import streamlit as st
import streamlit.components.v1 as components
from address_parsing_core import (
    parse_address_multi,
    normalize_name,
    get_autocorrect_suggestions,
    get_town_from_outward,
    extract_flat_from_building,
    join_tokens_preserving_commas,
    sanitize_field_edges,
    smart_title,
    check_town,
    check_county,
    generate_test_csv,
    sanitize_crf_street_name,
)
import sklearn_crfsuite
from train_crf_address_ner import predict_address_fields, sent2features

try:
    from rapidfuzz import process, fuzz
except ImportError:
    raise ImportError("RapidFuzz is required for fast autocorrect. Please install it with 'pip install rapidfuzz'.")

# ==================== DATA LOADING ====================
data_folder = "Data"

@st.cache_resource
def load_data():
    """Load all data files once and cache them"""
    with open('Pickles/valid_place_names.pkl', 'rb') as f:
        place_names = pickle.load(f)
    with open('Data/counties.csv', newline='', encoding='utf-8') as f:
        counties = [row[0].strip() for row in csv.reader(f) if row]
    with open('crf_model_v3_110925.pkl', 'rb') as f:
        crf_model = pickle.load(f)
    return place_names, counties, crf_model

place_names, counties, crf_model = load_data()

# ==================== SESSION STATE INITIALIZATION ====================
if 'output' not in st.session_state:
    st.session_state.output = []
if 'rest_outputs' not in st.session_state:
    st.session_state.rest_outputs = []
if 'crf_tags_list' not in st.session_state:
    st.session_state.crf_tags_list = []
if 'stats' not in st.session_state:
    st.session_state.stats = {'total': 0, 'postcodes': 0, 'towns': 0, 'street_names': 0, 'street_numbers': 0}
if 'unidentified' not in st.session_state:
    st.session_state.unidentified = []
if 'unidentified_postcodes' not in st.session_state:
    st.session_state.unidentified_postcodes = []
if 'unidentified_streets' not in st.session_state:
    st.session_state.unidentified_streets = []
if 'addresses_input' not in st.session_state:
    st.session_state.addresses_input = ""

# ==================== HELPER FUNCTIONS ====================

# ==================== MAIN APP ====================

def main():
    # Page configuration
    st.set_page_config(
        page_title="Address Parser",
        page_icon="🏠",
        layout="wide",
        initial_sidebar_state="collapsed"
    )
    
    # Custom CSS for lime color theme
    st.markdown("""
    <style>
    /* Lime color theme */
    :root {
        --lime-color: #8db600;
        --lime-hover: #6e9000;
    }
    
    /* Main title styling */
    .main-title {
        color: #8db600;
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 1rem;
    }
    
    /* Button styling */
    .stButton > button {
        background-color: #8db600;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 0.5rem 2rem;
        font-size: 1rem;
        font-weight: bold;
    }
    
    .stButton > button:hover {
        background-color: #6e9000;
    }
    
    /* Tab styling */
    .stTabs [data-baseweb="tab-list"] {
        gap: 2rem;
    }
    
    .stTabs [data-baseweb="tab"] {
        font-size: 1.1rem;
        font-weight: bold;
        color: #bdbdbd;
    }
    
    .stTabs [aria-selected="true"] {
        color: #8db600;
        border-bottom-color: #8db600;
    }
    
    /* Dataframe styling */
    .dataframe {
        font-size: 0.9rem;
    }
    
    /* Success/Error message styling */
    .stSuccess {
        background-color: #d4edda;
        color: #155724;
    }
    
    .stError {
        background-color: #f8d7da;
        color: #721c24;
    }
    
    /* Metric styling */
    [data-testid="stMetricValue"] {
        font-size: 2rem;
        color: #8db600;
    }
    </style>
    """, unsafe_allow_html=True)
    
    # Header with logo
    col1, col2 = st.columns([1, 9])
    with col1:
        st.markdown('<p class="main-title">LIME</p>', unsafe_allow_html=True)
    with col2:
        st.title("Address Parser")
    
    # Create tabs
    tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs(["Split", "Stats", "Unidentified", "Manual Fix", "Checkers", "Settings", "Rest"])
    
    # ==================== TAB 1: SPLIT ====================
    with tab1:
        st.subheader("Enter Addresses")
        
        # Address input
        addresses_input = st.text_area(
            "Enter addresses (one per line):",
            height=200,
            value=st.session_state.addresses_input,
            key="address_textarea"
        )
        
        # Update session state
        st.session_state.addresses_input = addresses_input
        
        # Buttons
        col1, col2, col3 = st.columns([1, 1, 4])
        with col1:
            split_button = st.button("Split", type="primary", use_container_width=True)
        with col2:
            test_button = st.button("Split (Testing Mode)", use_container_width=True)
        
        # Process addresses
        if split_button or test_button:
            if not addresses_input.strip():
                st.warning("Please enter at least one address.")
            else:
                with st.spinner("Processing addresses..."):
                    # Parse addresses
                    addresses = [line for line in addresses_input.split("\n") if line.strip()]
                    
                    # Progress bar
                    progress_bar = st.progress(0)
                    
                    def update_progress(val):
                        progress_bar.progress(val)
                    
                    # Run parser
                    allow_autocorrect_list = [False] * len(addresses)
                    result_list, stats, unidentified, unidentified_postcodes, applied_autocorrects, unidentified_streets, rest_outputs_local, town_spans_outputs_local, autocorrect_counts = parse_address_multi(
                        addresses, 
                        progress_callback=update_progress, 
                        allow_autocorrect_list=allow_autocorrect_list
                    )
                    
                    # Normalize rest outputs to title case before passing to CRF model
                    # CRF model was trained on title-cased text, so this improves accuracy
                    rest_outputs_normalized = [rest.title() for rest in rest_outputs_local]
                    
                    # Predict CRF tags
                    crf_tags_list = predict_address_fields(rest_outputs_normalized, crf_model)
                    
                    # Process results
                    processed_results = []
                    for i, line in enumerate(result_list):
                        parts = line.split("\t")
                        if len(parts) < 7:
                            parts.extend([''] * (7 - len(parts)))
                        
                        tokens = rest_outputs_normalized[i].split()  # Use normalized version to match CRF input
                        tags = crf_tags_list[i] if i < len(crf_tags_list) else []
                        building, street, number = [], [], []
                        for token, tag in zip(tokens, tags):
                            if tag.endswith('BUILDING'):
                                building.append(token)
                            elif tag.endswith('STREET'):
                                street.append(token)
                            elif tag.endswith('NUMBER'):
                                number.append(token)
                        
                        original_address = addresses[i] if i < len(addresses) else ""
                        parts[1] = join_tokens_preserving_commas(original_address, building)
                        parts[2] = join_tokens_preserving_commas(original_address, number)
                        parts[3] = sanitize_field_edges(" ".join(street))

                        # Extract flat from building name
                        flat_number, building_name, street_number = extract_flat_from_building(
                            parts[1],
                            parts[0],
                            parts[2],
                            address_line=addresses[i] if i < len(addresses) else "",
                        )
                        parts[0] = flat_number
                        parts[1] = building_name
                        parts[2] = street_number
                        
                        # Blank out row if missing critical fields (town or postcode)
                        if (not parts[5] or not parts[6]) or not parts[4]:
                            parts = ['', '', '', '', '', '', '']  # Blank out the entire row
                        else:
                            parts[3] = sanitize_crf_street_name(parts[3], parts[4])

                        processed_results.append(parts)
                    
                    # Store in session state
                    st.session_state.output = processed_results
                    st.session_state.rest_outputs = rest_outputs_local
                    st.session_state.crf_tags_list = crf_tags_list
                    st.session_state.stats = stats
                    st.session_state.unidentified = unidentified
                    st.session_state.unidentified_postcodes = unidentified_postcodes
                    st.session_state.unidentified_streets = unidentified_streets
                    
                    # Generate test CSV if in test mode
                    if test_button:
                        filename = generate_test_csv(addresses, result_list, rest_outputs_local, crf_tags_list, crf_model, rest_outputs_normalized)
                        st.success(f"✅ Test results saved to: {filename}")
                    
                    # Clear progress bar
                    progress_bar.empty()
        
        # Display results (ALWAYS show if available, not just after button click)
        if st.session_state.output:
            st.subheader("Results")
            
            # Create DataFrame
            df = pd.DataFrame(
                st.session_state.output,
                columns=["Flat No.", "Building Name", "Street No.", "Street Name", "Town", "Postcode Start", "Postcode End"]
            )
            
            # Display table
            st.dataframe(df, use_container_width=True, height=400)
            
            # Buttons row
            col1, col2, col3 = st.columns([1, 1, 4])
            
            # Prepare tab-separated data for copying (without index and without header)
            tsv_data = df.to_csv(sep='\t', index=False, header=False)
            
            with col1:
                # Custom copy button with working JavaScript
                copy_button_html = f"""
                    <div style="margin-top: 0px;">
                        <button id="copyBtn" style="
                            background-color: #8db600;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 0.5rem 2rem;
                            font-size: 1rem;
                            font-weight: bold;
                            cursor: pointer;
                            width: 100%;
                            height: 38px;
                        " onmouseover="this.style.backgroundColor='#6e9000'" 
                           onmouseout="this.style.backgroundColor='#8db600'">
                            📋 Copy Results
                        </button>
                    </div>
                    <textarea id="copyText" style="position: absolute; left: -9999px;">{tsv_data}</textarea>
                    <script>
                        document.getElementById('copyBtn').addEventListener('click', function() {{
                            var copyText = document.getElementById('copyText');
                            copyText.select();
                            copyText.setSelectionRange(0, 99999);
                            
                            try {{
                                document.execCommand('copy');
                                this.innerHTML = '✅ Copied!';
                                this.style.backgroundColor = '#28a745';
                                setTimeout(() => {{
                                    this.innerHTML = '📋 Copy Results';
                                    this.style.backgroundColor = '#8db600';
                                }}, 2000);
                            }} catch (err) {{
                                this.innerHTML = '❌ Failed';
                                this.style.backgroundColor = '#dc3545';
                            }}
                        }});
                    </script>
                """
                components.html(copy_button_html, height=50)
            
            with col2:
                # Download CSV button
                csv = df.to_csv(index=False).encode('utf-8')
                st.download_button(
                    label="💾 Download CSV",
                    data=csv,
                    file_name="address_parser_results.csv",
                    mime="text/csv",
                    use_container_width=True
                )
    
    # ==================== TAB 2: STATS ====================
    with tab2:
        st.subheader("Parsing Statistics")
        
        if st.session_state.stats['total'] > 0:
            stats = st.session_state.stats
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Addresses", stats['total'])
                postcode_pct = round((stats['postcodes'] / stats['total']) * 100, 1) if stats['total'] > 0 else 0
                st.metric("Postcodes Found", f"{stats['postcodes']} ({postcode_pct}%)")
            
            with col2:
                town_pct = round((stats['towns'] / stats['total']) * 100, 1) if stats['total'] > 0 else 0
                st.metric("Towns Found", f"{stats['towns']} ({town_pct}%)")
                
            with col3:
                street_name_pct = round((stats['street_names'] / stats['total']) * 100, 1) if stats['total'] > 0 else 0
                st.metric("Street Names Found", f"{stats['street_names']} ({street_name_pct}%)")
        else:
            st.info("No addresses parsed yet. Go to the 'Split' tab to parse addresses.")
    
    # ==================== TAB 3: UNIDENTIFIED ====================
    with tab3:
        st.subheader("Unidentified Addresses")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("#### Missing Towns")
            if st.session_state.unidentified:
                for addr in st.session_state.unidentified:
                    st.text(addr)
            else:
                st.info("No addresses with missing towns.")
        
        with col2:
            st.markdown("#### Missing Postcodes")
            if st.session_state.unidentified_postcodes:
                for addr in st.session_state.unidentified_postcodes:
                    st.text(addr)
            else:
                st.info("No addresses with missing postcodes.")
    
    # ==================== TAB 4: MANUAL FIX ====================
    with tab4:
        st.subheader("Manual Corrections")
        
        if not st.session_state.output:
            st.info("No addresses parsed yet. Go to the 'Split' tab to parse addresses first.")
        else:
            # Find addresses that need manual fixing (missing key fields)
            needs_fixing = []
            original_addresses = st.session_state.addresses_input.split("\n") if st.session_state.addresses_input else []
            
            for i, parts in enumerate(st.session_state.output):
                # Check if missing key fields: postcode or town
                if (not parts[5] or not parts[6]) or not parts[4]:  # Missing postcode start/end or town
                    original_addr = original_addresses[i] if i < len(original_addresses) else ""
                    needs_fixing.append({
                        'Index': i,
                        'Original Address': original_addr,
                        'Flat No.': parts[0],
                        'Building Name': parts[1],
                        'Street No.': parts[2],
                        'Street Name': parts[3],
                        'Town': parts[4],
                        'Postcode Start': parts[5],
                        'Postcode End': parts[6]
                    })
            
            if not needs_fixing:
                st.success("✅ All addresses were parsed successfully! No manual corrections needed.")
            else:
                st.warning(f"⚠️ {len(needs_fixing)} address(es) need manual correction")
                
                # Add status column showing what's missing
                for item in needs_fixing:
                    issues = []
                    if not item['Town']:
                        issues.append("MISSING TOWN")
                    if not item['Postcode Start'] or not item['Postcode End']:
                        issues.append("MISSING POSTCODE")
                    item['Status'] = ', '.join(issues) if issues else "INCOMPLETE"
                
                # Create DataFrame for display
                df_fix = pd.DataFrame(needs_fixing)
                
                # Reorder columns to put Status first after Index
                cols = ['Index', 'Status', 'Original Address', 'Flat No.', 'Building Name', 'Street No.', 'Street Name', 'Town', 'Postcode Start', 'Postcode End']
                df_fix = df_fix[cols]
                
                # Show which rows need manual fixing
                st.markdown("**⚠️ The following addresses need manual correction:**")
                st.markdown("These rows are **left blank** in your output. Copy all results to Excel and manually fill in these rows.")
                
                # Display list of incomplete addresses with what's missing
                for item in needs_fixing:
                    status_color = "🔴" if "MISSING TOWN" in item['Status'] else "🟡"
                    st.markdown(f"{status_color} **Row #{item['Index'] + 1}:** {item['Original Address']}")
                    st.caption(f"   ➜ {item['Status']}")
                
                st.markdown("---")
                st.info("💡 **Workflow:** Copy all results from the 'Split' tab, paste into Excel, then manually fill in the rows listed above.")
    
    # ==================== TAB 5: CHECKERS ====================
    with tab5:
        st.subheader("Data Checkers")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.markdown("#### Town Checker")
            town_input = st.text_input("Enter town name:", key="town_checker")
            if st.button("Check Town", key="check_town_btn"):
                is_valid, message = check_town(town_input)
                if is_valid is True:
                    st.success(message)
                elif is_valid is False:
                    st.error(message)
                else:
                    st.warning(message)
        
        with col2:
            st.markdown("#### County Checker")
            county_input = st.text_input("Enter county name:", key="county_checker")
            if st.button("Check County", key="check_county_btn"):
                is_valid, message = check_county(county_input)
                if is_valid is True:
                    st.success(message)
                elif is_valid is False:
                    st.error(message)
                else:
                    st.warning(message)
    
    # ==================== TAB 6: SETTINGS ====================
    with tab6:
        st.subheader("Parser Settings")
        
        st.info("⚠️ Autocorrect is currently disabled in this version. Settings are for display only.")
        
        st.markdown("#### Town Autocorrect Strictness")
        town_strictness = st.select_slider(
            "Town strictness:",
            options=["Off", "Extremely strict", "Strict", "Moderate", "Lenient"],
            value="Strict",
            key="town_strictness"
        )
        
        st.markdown("#### County Autocorrect Strictness")
        county_strictness = st.select_slider(
            "County strictness:",
            options=["Off", "Extremely strict", "Strict", "Moderate", "Lenient"],
            value="Strict",
            key="county_strictness"
        )
        
        if st.button("Apply Settings", type="primary"):
            st.success("Settings applied! (Note: Autocorrect is currently disabled)")
    
    # ==================== TAB 7: REST ====================
    with tab7:
        st.subheader("CRF Model Output (Rest Text)")
        
        if st.session_state.rest_outputs:
            st.markdown("#### Rest Text Analysis")
            
            for i, (rest_text, tags) in enumerate(zip(st.session_state.rest_outputs, st.session_state.crf_tags_list)):
                with st.expander(f"Address {i+1}: {rest_text}"):
                    tokens = rest_text.split()
                    
                    # Create DataFrame for tokens and tags
                    if len(tokens) > 0 and len(tags) > 0:
                        df_tokens = pd.DataFrame({
                            'Token': tokens,
                            'Tag': tags
                        })
                        st.dataframe(df_tokens, use_container_width=True)
                    else:
                        st.info("No tokens to display")
        else:
            st.info("No 'rest' data available. Parse addresses in the 'Split' tab first.")

if __name__ == "__main__":
    main()
