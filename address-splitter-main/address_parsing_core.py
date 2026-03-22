import re
import csv
import pickle
import json
from rapidfuzz import process, fuzz
import os
BASE_DIR = os.path.dirname(__file__)

# ===================== AUTOCORRECT THRESHOLDS (ADJUST HERE) =====================
TOWN_AUTOCORRECT_THRESHOLD = 0.95
COUNTY_AUTOCORRECT_THRESHOLD = 0.95

# ===================== DO NOT AUTOCORRECT LIST =====================
with open(os.path.join(BASE_DIR, 'Data', 'do_not_autocorrect.csv'), newline='', encoding='utf-8') as f:
    DO_NOT_AUTOCORRECT = set(row[0] for row in csv.reader(f) if row)

manual_town_overrides = {"Rossendale", "Hull", "Sutton Coldfield", "Aberlour", "Cwmbran"}
excluded_town_names = {"Trent", "Street", "Park", "Marsh", "Close", "Avon", "Kent", "Grove", "Lane"}

with open(os.path.join(BASE_DIR, 'Pickles', 'valid_place_names.pkl'), "rb") as f:
    gb_places = pickle.load(f)
with open(os.path.join(BASE_DIR, 'Pickles', 'valid_place_names_NI.pkl'), "rb") as f:
    ni_places = pickle.load(f)
try:
    with open(os.path.join(BASE_DIR, 'Pickles', 'valid_street_names.pkl'), "rb") as f:
        valid_street_names = pickle.load(f)
except FileNotFoundError:
    valid_street_names = set()
    print("Warning: valid_street_names.pkl not found. Street name checking will be disabled.")
combined_places = gb_places.union(ni_places)
with open(os.path.join(BASE_DIR, 'Pickles', 'valid_place_names_combined.pkl'), "wb") as f:
    pickle.dump(combined_places, f)
with open(os.path.join(BASE_DIR, 'Pickles', 'valid_place_names_combined.pkl'), "rb") as f:
    place_names = pickle.load(f)
place_names.update(manual_town_overrides)

outward_town_mapping = {}
try:
    with open(os.path.join(BASE_DIR, 'Data', 'outward_town_mapping.csv'), "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            outward_town_mapping[row['Outward'].upper()] = row['Town']
    print(f"Loaded {len(outward_town_mapping)} outward town mappings")
except FileNotFoundError:
    print("Warning: outward_town_mapping.csv not found. Outward town mapping will not be available.")
    outward_town_mapping = {}
except Exception as e:
    print(f"Error loading outward town mapping: {e}")
    outward_town_mapping = {}

def get_town_from_outward(outward_code):
    if not outward_code or not outward_town_mapping:
        return None
    if outward_code.upper() in outward_town_mapping:
        return outward_town_mapping[outward_code.upper()]
    clean_outward = re.sub(r'[^A-Z0-9]', '', outward_code.upper())
    if clean_outward in outward_town_mapping:
        return outward_town_mapping[clean_outward]
    return None

with open(os.path.join(BASE_DIR, 'Data', 'countries.csv'), newline='', encoding='utf-8') as f:
    countries = [row[0].strip() for row in csv.reader(f) if row]

with open(os.path.join(BASE_DIR, 'Data', 'counties.csv'), newline='', encoding='utf-8') as f:
    counties = [row[0].strip() for row in csv.reader(f) if row]

suffix_connectors = {
    "upon thames", "on thames", "by sea", "on trent", "on sea", "upon avon", "upon tyne",
    "upon dee", "upon clwyd", "upon wye", "on wye", "by the sea", "in furness",
    "in wold", "in holderness", "avon"
}
with open(os.path.join(BASE_DIR, 'Data', 'traditional_scottish_counties.csv'), newline='', encoding='utf-8') as f:
    traditional_scottish_counties = [row[0] for row in csv.reader(f) if row]

postcode_pattern = r'\(?\s*([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})\s*\)?'

def smart_title(text):
    text = text.title()
    result = []
    for i, char in enumerate(text):
        if i > 0 and text[i - 1] == "'":
            result.append(char.lower())
        else:
            result.append(char)
    return ''.join(result).strip()

def normalize_name(name):
    name = name.replace('-', ' ').replace("'", "").replace('.', '').strip()
    return ' '.join(name.split()).title()

def normalize_substring(s):
    return re.sub(r'\s+', ' ', s.strip().lower())

def get_autocorrect_county_suggestion(candidate, county_list, threshold=COUNTY_AUTOCORRECT_THRESHOLD):
    if candidate.title() in DO_NOT_AUTOCORRECT:
        return None
    choices = [c.upper() for c in county_list]
    result = process.extractOne(candidate.upper(), choices, scorer=fuzz.ratio, score_cutoff=int(threshold * 100))
    if result:
        return result[0].title()
    return None

def get_autocorrect_suggestions(extracted_towns, valid_places, threshold=None, candidate_type=None, word_positions=None):
    if threshold is None:
        threshold = TOWN_AUTOCORRECT_THRESHOLD
    corrections = {}
    valid_places_upper = [place.upper() for place in valid_places]
    for idx, town in enumerate(extracted_towns):
        town_upper = town.upper()
        if town.title() in DO_NOT_AUTOCORRECT:
            continue  # Skip autocorrect for this word
        # Heuristic: skip autocorrect for single-word numbers or words that look like numbers
        if town.strip().isdigit() or (len(town.strip()) > 0 and town.strip()[0].isdigit()):
            continue
        # Do not autocorrect as a town if word is position 0 or 1
        if candidate_type == 'town' and word_positions is not None and word_positions[idx] in (0, 1):
            continue
        # Do not autocorrect as a county if word is position 0, 1, or 2
        if candidate_type == 'county' and word_positions is not None and word_positions[idx] in (0, 1, 2):
            continue
        if town_upper not in valid_places_upper:
            result = process.extractOne(town_upper, valid_places_upper, scorer=fuzz.ratio, score_cutoff=int(threshold * 100))
            if result:
                corrections[town] = result[0].title()
    return corrections

def preview_split_address(address, outward, inward, place_names, counties):
    cleaned_address = re.sub(postcode_pattern, '', address, flags=re.IGNORECASE)
    cleaned_address = re.sub(r'[,()]', '', cleaned_address).strip()
    cleaned_address = cleaned_address.replace('&', 'and')
    cleaned_address = re.sub(r'\.+$', '', cleaned_address).strip()
    for c in counties:
        pattern = rf'\b{re.escape(c)}\b'
        cleaned_address = re.sub(pattern, '', cleaned_address, flags=re.IGNORECASE).strip()
    for tsc in traditional_scottish_counties:
        pattern = rf'\b{re.escape(tsc)}\b[\s,]*\b{re.escape(tsc)}\b'
        cleaned_address = re.sub(pattern, tsc, cleaned_address, flags=re.IGNORECASE)
    for tsc in traditional_scottish_counties:
        pattern = rf'\b{re.escape(tsc)}\b'
        cleaned_address = re.sub(pattern, '', cleaned_address, flags=re.IGNORECASE).strip()
    for county_name in counties:
        pattern = rf'\b{re.escape(county_name)}\b[\s,]*\b{re.escape(county_name)}\b'
        cleaned_address = re.sub(pattern, county_name, cleaned_address, flags=re.IGNORECASE)
    cleaned_address = re.sub(r'\b(Co\.?|County of)\b', '', cleaned_address, flags=re.IGNORECASE).strip()
    words = cleaned_address.replace('-', ' ').split()
    words = [w.replace('.', '').replace("'", "") for w in words]
    cleaned_address = re.sub(r'[,.]', ' ', cleaned_address)
    cleaned_address = re.sub(r'\s+', ' ', cleaned_address)
    words = cleaned_address.split()
    max_check = min(5, len(words))
    for length in range(max_check, 0, -1):
        phrase_words = words[-length:]
        candidate_phrase = ' '.join(phrase_words).title().strip()
        normalized_candidate = candidate_phrase.replace("'", "").replace("-", " ").strip()
        if normalize_name(normalized_candidate) in {normalize_name(p) for p in place_names}:
            return f"{candidate_phrase}\t{outward}\t{inward}"
    return f"\t{outward}\t{inward}"

# --- Add global for rest outputs and spans ---
rest_outputs = []

directionals = {
    "N", "S", "E", "W",
    "NE", "NW", "SE", "SW",
    "North", "South", "East", "West", "Mid",
    "North East", "North West",
    "South East", "South West",
    "Mid West", "Mid East",
    "Northeast", "Northwest",
    "Southeast", "Southwest"
}

def find_town(words, start_idx):
    max_check = min(5, start_idx)

    for length in range(max_check, 0, -1):
        phrase_words = words[start_idx - length : start_idx]
        candidate_phrase = ' '.join(phrase_words).title().strip()
        normalized_candidate = normalize_name(candidate_phrase)

        # O(1) lookup
        if normalized_candidate in formatted_place_names:
            if length == 1 and normalized_candidate in excluded_town_names:
                continue
            return formatted_place_names[normalized_candidate]

        # Try candidate + suffixes (space and hyphen)
        for suffix in suffix_connectors:
            extended_space = (candidate_phrase + " " + suffix.title()).replace("'", "").strip()
            normalized_space = normalize_name(extended_space)
            if normalized_space in formatted_place_names:
                return formatted_place_names[normalized_space]

            extended_hyphen = (candidate_phrase + "-" + suffix.title()).replace("'", "").strip()
            normalized_hyphen = normalize_name(extended_hyphen)
            if normalized_hyphen in formatted_place_names:
                return formatted_place_names[normalized_hyphen]

    # If no town found, try removing suffix connectors
    for suffix in suffix_connectors:
        suffix_words = suffix.split()
        if [w.lower() for w in words[start_idx - len(suffix_words) : start_idx]] == suffix_words:
            new_start_idx = start_idx - len(suffix_words)
            if new_start_idx > 0:
                return find_town(words, new_start_idx)
            else:
                return ""

    # Try adding directional prefixes but skip if base candidate is in excluded_town_names
    for length in range(max_check, 0, -1):
        phrase_words = words[start_idx - length : start_idx]
        base_candidate = ' '.join(phrase_words).title().strip()
        if base_candidate in excluded_town_names:
            continue
        for directional in directionals:
            combined = (directional + " " + base_candidate).strip()
            normalized_combined = normalize_name(combined)
            if normalized_combined in formatted_place_names:
                return formatted_place_names[normalized_combined]

    return ""

# Set of common street suffixes to exclude as one-word streets
street_suffixes = set()
with open(os.path.join(BASE_DIR, 'Data', 'do_not_autocorrect.csv'), newline='', encoding='utf-8') as f:
    for row in csv.reader(f):
        if row:
            street_suffixes.add(row[0])
# --- Removed find_street and split_single_number_single_letter logic ---

directionals_multiword = {
    "North East", "North West", "South East", "South West",
    "Mid West", "Mid East"
}

def find_country(words, country_list):
    for length in range(3, 0, -1):
        if len(words) >= length:
            candidate = ' '.join(words[-length:]).title().strip()
            for country in country_list:
                if normalize_name(candidate) == normalize_name(country):
                    print(f"DEBUG: Found country: {country}")
                    return country, (len(words) - length, len(words))
    return '', None

def find_traditional_county(words, tsc_list, exclude_spans=None):
    if exclude_spans is None:
        exclude_spans = []
    filtered_words = [w for i, w in enumerate(words) if not any(start <= i < end for (start, end) in exclude_spans)]
    for length in range(2, 0, -1):
        if len(filtered_words) >= length:
            candidate = ' '.join(filtered_words[-length:]).title().strip()
            for tsc in tsc_list:
                if normalize_name(candidate) == normalize_name(tsc):
                    print(f"DEBUG: Found traditional county: {tsc}")
                    # Map back to original indices
                    start = len(words) - len(filtered_words) + (len(filtered_words) - length)
                    end = start + length
                    return tsc, (start, end)
    return '', None

def find_county(words, county_list, exclude_spans=None):
    if exclude_spans is None:
        exclude_spans = []
    filtered_words = [w for i, w in enumerate(words) if not any(start <= i < end for (start, end) in exclude_spans)]
    for length in range(3, 0, -1):
        if len(filtered_words) >= length:
            candidate = ' '.join(filtered_words[-length:]).title().strip()
            for county in county_list:
                if normalize_name(candidate) == normalize_name(county):
                    print(f"DEBUG: Found county: {county}")
                    # Map back to original indices
                    start = len(words) - len(filtered_words) + (len(filtered_words) - length)
                    end = start + length
                    return county, (start, end)
    return '', None

def parse_address_multi(addresses, progress_callback=None, allow_autocorrect_list=None, address_indices_to_parse=None):
    """
    Parse multiple addresses with optional selective parsing.
    
    Args:
        addresses: List of addresses to parse
        progress_callback: Optional callback for progress updates
        allow_autocorrect_list: Optional list of boolean flags for each address
        address_indices_to_parse: Optional list of indices to parse (if None, parse all)
    """
    
    # If specific indices provided, only parse those addresses
    if address_indices_to_parse is not None:
        # Create a subset of addresses to parse
        subset_addresses = [addresses[i] for i in address_indices_to_parse if i < len(addresses)]
        # Create corresponding allow_autocorrect_list for subset
        subset_allow_autocorrect = None
        if allow_autocorrect_list is not None:
            subset_allow_autocorrect = [allow_autocorrect_list[i] for i in address_indices_to_parse if i < len(allow_autocorrect_list)]
        
        # Parse the subset
        subset_output, subset_stats, subset_unidentified, subset_unidentified_postcodes, subset_applied_autocorrects, subset_unidentified_streets, subset_rest_outputs, subset_town_spans_outputs, subset_autocorrect_counts = parse_address_multi(subset_addresses, progress_callback, subset_allow_autocorrect)
        
        # Create full output arrays with empty values
        full_output = [""] * len(addresses)
        full_rest_outputs = [""] * len(addresses)
        full_autocorrect_counts = [0] * len(addresses)
        
        # Fill in the parsed results at the correct indices
        for i, original_idx in enumerate(address_indices_to_parse):
            if original_idx < len(addresses):
                full_output[original_idx] = subset_output[i]
                full_rest_outputs[original_idx] = subset_rest_outputs[i]
                full_autocorrect_counts[original_idx] = subset_autocorrect_counts[i]
        
        # Return the full arrays with only the specified addresses filled in
        return full_output, subset_stats, subset_unidentified, subset_unidentified_postcodes, subset_applied_autocorrects, subset_unidentified_streets, full_rest_outputs, None, full_autocorrect_counts
    
    # Original full parsing logic continues unchanged
    output = [""] * len(addresses)
    postcode_count = 0
    town_count = 0
    street_name_count = 0
    street_number_count = 0
    unidentified_addresses = []
    unidentified_postcodes = []
    unidentified_streets = []
    applied_autocorrects = []  # Track autocorrects that were applied
    autocorrect_counts = [0] * len(addresses)
    global rest_outputs
    rest_outputs = []

    # Precompute normalized sets/dicts for fast lookup
    formatted_place_names = {normalize_name(name): name.strip() for name in place_names}
    normalized_places = set(formatted_place_names.keys())

    def find_town(words, start_idx):
        max_check = min(5, start_idx)
        print(f"DEBUG find_town: words={words}, start_idx={start_idx}, max_check={max_check}")

        for length in range(max_check, 0, -1):
            phrase_words = words[start_idx - length : start_idx]
            candidate_phrase = ' '.join(phrase_words).title().strip()
            normalized_candidate = normalize_name(candidate_phrase)
            print(f"DEBUG find_town: checking length={length}, phrase_words={phrase_words}, candidate_phrase='{candidate_phrase}', normalized='{normalized_candidate}'")

            # O(1) lookup
            if normalized_candidate in formatted_place_names:
                print(f"DEBUG find_town: MATCH FOUND! normalized_candidate='{normalized_candidate}' in formatted_place_names")
                if length == 1 and normalized_candidate in excluded_town_names:
                    print(f"DEBUG find_town: but skipping because it's in excluded_town_names")
                    continue
                print(f"DEBUG find_town: returning '{formatted_place_names[normalized_candidate]}'")
                return formatted_place_names[normalized_candidate]

            # Try candidate + suffixes (space and hyphen)
            for suffix in suffix_connectors:
                extended_space = (candidate_phrase + " " + suffix.title()).replace("'", "").strip()
                normalized_space = normalize_name(extended_space)
                if normalized_space in formatted_place_names:
                    return formatted_place_names[normalized_space]

                extended_hyphen = (candidate_phrase + "-" + suffix.title()).replace("'", "").strip()
                normalized_hyphen = normalize_name(extended_hyphen)
                if normalized_hyphen in formatted_place_names:
                    return formatted_place_names[normalized_hyphen]

        # If no town found, try removing suffix connectors
        for suffix in suffix_connectors:
            suffix_words = suffix.split()
            if [w.lower() for w in words[start_idx - len(suffix_words) : start_idx]] == suffix_words:
                new_start_idx = start_idx - len(suffix_words)
                if new_start_idx > 0:
                    return find_town(words, new_start_idx)
                else:
                    return ""

        # Try adding directional prefixes but skip if base candidate is in excluded_town_names
        for length in range(max_check, 0, -1):
            phrase_words = words[start_idx - length : start_idx]
            base_candidate = ' '.join(phrase_words).title().strip()
            if base_candidate in excluded_town_names:
                continue
            for directional in directionals:
                combined = (directional + " " + base_candidate).strip()
                normalized_combined = normalize_name(combined)
                if normalized_combined in formatted_place_names:
                    return formatted_place_names[normalized_combined]

        return ""

    # Set of common street suffixes to exclude as one-word streets
    street_suffixes = set()
    with open(os.path.join(BASE_DIR, 'Data', 'do_not_autocorrect.csv'), newline='', encoding='utf-8') as f:
        for row in csv.reader(f):
            if row:
                street_suffixes.add(row[0])
    # --- Removed find_street and split_single_number_single_letter logic ---

    directionals_multiword = {
        "North East", "North West", "South East", "South West",
        "Mid West", "Mid East"
    }

    for idx, address in enumerate(addresses):
        allow_autocorrect = True
        if allow_autocorrect_list is not None:
            allow_autocorrect = allow_autocorrect_list[idx]
        # Replace double apostrophes with single apostrophe BEFORE normalizing
        address = address.replace("''", "'")

        # Normalize: ensure every comma is followed by a space
        address = re.sub(r',(?=\S)', ', ', address)

        town = county = country = inward = outward = street_name = street_number = flat_number = building_name = ""
        words = []

        match = re.search(postcode_pattern, address, re.IGNORECASE)

        if match:
            outward = match.group(1).upper()
            inward = match.group(2).upper()            
            full_postcode = (outward + inward).replace(" ", "")
            postcode_count += 1

            if outward and inward:
                # Proceed with normal cleaning and town finding
                cleaned_address = re.sub(postcode_pattern, '', address, flags=re.IGNORECASE)
                cleaned_address = re.sub(r'[,\(\)]', '', cleaned_address).strip()
                cleaned_address = cleaned_address.replace('&', 'and')
                cleaned_address = re.sub(r'\.+$', '', cleaned_address).strip()

                # After postcode extraction and cleaning:
                words = cleaned_address.split()

                # Remove postcode from the end if present
                if words and re.fullmatch(postcode_pattern, words[-1], re.IGNORECASE):
                    print(f"DEBUG: Removing postcode from words: {words[-1]}")
                    words = words[:-1]

                # Country detection (last 3, 2, 1 words)
                country = ''
                for length in range(3, 0, -1):
                    if len(words) >= length:
                        candidate = ' '.join(words[-length:]).title().strip()
                        for c in countries:
                            if normalize_name(candidate) == normalize_name(c):
                                country = c
                                print(f"DEBUG: Found country: {country}")
                                words = words[:-length]
                                break
                        if country:
                            break

                # Traditional Scottish county detection (last 2, 1 words) with directional support
                ts_county = ''
                for length in range(2, 0, -1):
                    if len(words) >= length:
                        candidate = ' '.join(words[-length:]).title().strip()
                        print(f"DEBUG tsc: checking length={length}, candidate='{candidate}'")
                        
                        # First try exact match
                        for tsc in traditional_scottish_counties:
                            if normalize_name(candidate) == normalize_name(tsc):
                                ts_county = tsc
                                print(f"DEBUG: Found traditional county: {ts_county}")
                                words = words[:-length]
                                break
                        
                        # If no exact match and length > 1, try directional + county
                        if not ts_county and length > 1:
                            first_word = words[-(length)].title().strip()
                            remaining_words = words[-(length-1):]
                            remaining_candidate = ' '.join(remaining_words).title().strip()
                            
                            print(f"DEBUG tsc: trying directional+county: first_word='{first_word}', remaining='{remaining_candidate}'")
                            
                            # Check if first word is directional and remaining is traditional Scottish county
                            if first_word in directionals:
                                for tsc in traditional_scottish_counties:
                                    if normalize_name(remaining_candidate) == normalize_name(tsc):
                                        ts_county = tsc
                                        print(f"DEBUG: Found traditional county with directional: {first_word} {remaining_candidate} -> {ts_county}")
                                        words = words[:-length]
                                        break
                        
                        if ts_county:
                            break

                county_autocorrected = False
                # County detection (last 3, 2, 1 words) with directional support
                county = ''
                county_removed_length = 0  # Track how many words were removed for the county
                print(f"DEBUG county: words before county detection: {words}")
                for length in range(3, 0, -1):
                    if len(words) >= length:
                        candidate = ' '.join(words[-length:]).title().strip()
                        print(f"DEBUG county: checking length={length}, candidate='{candidate}'")
                        
                        # First try exact match
                        for c in counties:
                            if normalize_name(candidate) == normalize_name(c):
                                print(f"DEBUG county: EXACT MATCH! '{candidate}' matches county '{c}'")
                                county = c
                                county_removed_length = length
                                print(f"DEBUG county: words before removal: {words}")
                                words = words[:-length]
                                print(f"DEBUG county: words after county removal: {words}")
                                
                                # Check if the word before the county was "Co." or "County" and remove it too
                                if len(words) > 0 and words[-1].lower() in ['co.', 'co', 'county']:
                                    print(f"DEBUG county: removing 'Co.' prefix: '{words[-1]}'")
                                    words = words[:-1]
                                    print(f"DEBUG county: words after 'Co.' removal: {words}")
                                
                                break
                        
                        # If no exact match and length > 1, try directional + county
                        if not county and length > 1:
                            first_word = words[-(length)].title().strip()
                            remaining_words = words[-(length-1):]
                            remaining_candidate = ' '.join(remaining_words).title().strip()
                            
                            print(f"DEBUG county: trying directional+county: first_word='{first_word}', remaining='{remaining_candidate}'")
                            
                            # Check if first word is directional and remaining is county
                            if first_word in directionals:
                                for c in counties:
                                    if normalize_name(remaining_candidate) == normalize_name(c):
                                        print(f"DEBUG county: DIRECTIONAL MATCH! '{first_word} {remaining_candidate}' -> county '{c}'")
                                        county = c
                                        county_removed_length = length  # Track that we removed directional + county
                                        print(f"DEBUG county: words before removal: {words}")
                                        words = words[:-length]
                                        print(f"DEBUG county: words after county removal: {words}")
                                        
                                        # Check if the word before the county was "Co." or "County" and remove it too
                                        if len(words) > 0 and words[-1].lower() in ['co.', 'co', 'county']:
                                            print(f"DEBUG county: removing 'Co.' prefix: '{words[-1]}'")
                                            words = words[:-1]
                                            print(f"DEBUG county: words after 'Co.' removal: {words}")
                                        
                                        break
                        
                        if county:
                            break
                
                # Check for back-to-back duplicate counties (e.g., "Hertfordshire Hertfordshire" or "East Hertfordshire East Hertfordshire")
                if county and county_removed_length > 0:
                    print(f"DEBUG duplicate county: county='{county}', removed_length={county_removed_length}, words={words}")
                    
                    # Check if the same number of words at the end match the base county (with or without directional)
                    if len(words) >= county_removed_length:
                        last_n_words = words[-county_removed_length:]
                        candidate = ' '.join(last_n_words).title().strip()
                        print(f"DEBUG duplicate county: checking if '{candidate}' forms same county pattern")
                        
                        # Case 1: If removed_length > 1, check if it's directional + county
                        if county_removed_length > 1:
                            first_word = last_n_words[0].title().strip()
                            remaining_words = last_n_words[1:]
                            remaining = ' '.join(remaining_words).title().strip()
                            
                            # Check if this is also directional + same county
                            if first_word in directionals and normalize_name(remaining) == normalize_name(county):
                                print(f"DEBUG duplicate county: FOUND back-to-back duplicate with directional! '{first_word} {remaining}'")
                                words = words[:-county_removed_length]
                                print(f"DEBUG duplicate county: words after duplicate removal: {words}")
                        
                        # Case 2: Check if it's just the county name (exact match)
                        if normalize_name(candidate) == normalize_name(county):
                            print(f"DEBUG duplicate county: FOUND back-to-back duplicate! Removing '{candidate}'")
                            words = words[:-county_removed_length]
                            print(f"DEBUG duplicate county: words after duplicate removal: {words}")
                
                # If no county found with exact match, try autocorrect
                if not county and allow_autocorrect:
                    for length in range(3, 0, -1):
                        if len(words) >= length:
                            candidate = ' '.join(words[-length:]).title().strip()
                            corrected_county = get_autocorrect_county_suggestion(candidate, counties, COUNTY_AUTOCORRECT_THRESHOLD)
                            if corrected_county:
                                county = corrected_county
                                words = words[:-length]
                                
                                # Check if the word before the county was "Co." or "County" and remove it too
                                if len(words) > 0 and words[-1].lower() in ['co.', 'co', 'county']:
                                    words = words[:-1]
                                
                                county_autocorrected = True
                                autocorrect_counts[idx] += 1
                                applied_autocorrects.append({
                                    "index": idx,
                                    "original_address": address,
                                    "original_text": candidate,
                                    "corrected_text": corrected_county,
                                    "type": "county",
                                    "applied": True
                                })
                                break

                # After all country, tsc, and county removals, before town detection:
                start_idx = len(words)
                print(f"DEBUG: start_idx for town detection: {start_idx}")
                print(f"DEBUG: words before town detection: {words}")
                print(f"DEBUG: length of words: {len(words)}")
                
                # Debug: Check if any words contain town names
                for i, word in enumerate(words):
                    if normalize_name(word) in normalized_places:
                        print(f"DEBUG: Word {i} '{word}' is a town name!")
                
                # First pass: Try to find town normally (including directionals in case there's a town like "Hertford East")
                town = find_town(words, start_idx)
                print(f"DEBUG: town found by find_town (first pass): '{town}'")
                
                # Second pass: If no town found, check if last 1-2 words are directionals
                # If so, temporarily ignore them and try town detection again
                directionals_to_remove = []
                if town == "":
                    print(f"DEBUG directional town: No town found, checking for trailing directionals")
                    
                    # Check if last 2 words are directionals (e.g., "North East")
                    if len(words) >= 2:
                        last_two = ' '.join(words[-2:]).title().strip()
                        if last_two in directionals:
                            print(f"DEBUG directional town: Last 2 words '{last_two}' are directional")
                            directionals_to_remove = words[-2:]
                            temp_words = words[:-2]
                            temp_start_idx = len(temp_words)
                            town = find_town(temp_words, temp_start_idx)
                            if town != "":
                                print(f"DEBUG directional town: Found town '{town}' after ignoring directionals '{last_two}'")
                                words = temp_words  # Remove the directionals
                                start_idx = temp_start_idx
                            else:
                                directionals_to_remove = []  # Keep them if no town found
                    
                    # If still no town, check if last 1 word is directional
                    if town == "" and len(words) >= 1:
                        last_one = words[-1].title().strip()
                        if last_one in directionals:
                            print(f"DEBUG directional town: Last word '{last_one}' is directional")
                            directionals_to_remove = [words[-1]]
                            temp_words = words[:-1]
                            temp_start_idx = len(temp_words)
                            town = find_town(temp_words, temp_start_idx)
                            if town != "":
                                print(f"DEBUG directional town: Found town '{town}' after ignoring directional '{last_one}'")
                                words = temp_words  # Remove the directional
                                start_idx = temp_start_idx
                            else:
                                directionals_to_remove = []  # Keep it if no town found
                
                print(f"DEBUG: town found by find_town (after directional check): '{town}'")
                
                # Debug: Check what words remain after town detection
                print(f"DEBUG: words after town detection: {words}")
                print(f"DEBUG: start_idx after town detection: {start_idx}")
                
                if town != "":
                    town_count += 1
                # Only attempt town autocorrect if town is still not recognized and county was not autocorrected
                if town == "" and not county_autocorrected and allow_autocorrect:
                    town_words = words[:start_idx] if start_idx > 0 else words
                    max_words = min(3, len(town_words))
                    found_suggestion = False
                    for n in range(max_words, 0, -1):
                        candidate_town_words = town_words[-n:]
                        attempted = " ".join(candidate_town_words).strip()
                        # Find the position of the first word of the candidate in the address
                        if candidate_town_words[0] in words:
                            position = words.index(candidate_town_words[0])
                        else:
                            position = 0
                        suggestion = get_autocorrect_suggestions([attempted], place_names, candidate_type='town', word_positions=[position])
                        if suggestion:
                            corrected = suggestion[attempted]
                            # Apply the correction immediately
                            town = corrected
                            town_count += 1
                            autocorrect_counts[idx] += 1
                            applied_autocorrects.append({
                                "index": idx,
                                "original_address": address,
                                "original_text": attempted,
                                "corrected_text": corrected,
                                "type": "town",
                                "applied": True
                            })
                            found_suggestion = True
                            break
                
                # LAST RESORT: Use outward postcode to find town if still not found
                if town == "" and outward:
                    outward_town = get_town_from_outward(outward)
                    if outward_town:
                        town = outward_town
                        town_count += 1
                        # No need to track this as an autocorrect since it's based on official postcode data

                # Find street name and number
                # --- Removed street finding logic ---
                flat_number = ''
                building_name = ''
                street_number = ''
                street_name = ''

                # The rest of the logic (output, stats, etc.) remains unchanged.
        # Count street name and number for every address, not just when town is found
        if street_name:
            street_name_count += 1
        if street_number:
            street_number_count += 1

        # Track missing town
        if town == "":
            unidentified_addresses.append(address)
        # Track missing street name
        if street_name == "":
            unidentified_streets.append(address)

        # After extracting postcode and town, set all other fields to empty and collect 'the_rest'
        flat_number = ''
        building_name = ''
        street_number = ''
        street_name = ''
        cleaned = address
        if outward:
            cleaned = cleaned.replace(outward, '', 1)
        if inward:
            cleaned = cleaned.replace(inward, '', 1)
        # County and town removal is handled by the word-by-word detection above
        # Don't remove county names globally as they might appear in street names
        cleaned = re.sub(r'[,.]', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        # Always try to extract REST output, even if town or postcode not found
        rest = cleaned.strip()
        print(f"DEBUG rest: initial cleaned='{cleaned}'")
        print(f"DEBUG rest: initial rest='{rest}'")
        spans = []
        
        if town:
            town_idx = cleaned.lower().find(town.lower())
            print(f"DEBUG rest: town='{town}', town_idx={town_idx}")
            if town_idx != -1:
                rest = cleaned[:town_idx].strip()
                print(f"DEBUG rest: after removing town, rest='{rest}'")
        
        # After extracting the town, instead of '.replace', use this helper:
        def remove_trailing_town(text, town):
            # Remove trailing whole-word town (optionally after comma/space)
            pattern = r'(.*?)([, ]+)?\b' + re.escape(town) + r'\b\s*$'
            match = re.match(pattern, text, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip()
            return text
        rest = remove_trailing_town(cleaned, town)
        print(f"DEBUG rest: after removing trailing town, rest='{rest}'")
        
        # Town spans
        # REMOVE: town_spans = detect_town_spans(rest, place_names)
        # Street spans
        # REMOVE: street_spans = detect_street_spans(rest, valid_street_names)
        # spans = town_spans + street_spans
        
        print(f"DEBUG rest: FINAL rest for CRF='{rest}'")
        rest_outputs.append(rest)
        # REMOVE: town_spans_outputs.append({
        # REMOVE:     'pre_address': rest,
        # REMOVE:     'spans': spans
        # REMOVE: })
        # (Inside the main parsing loop, after all fields have been set, before blanking for missing data)
        # Ensure fields exist:
        # flat_number, building_name, street_number, street_name, town, outward, inward, county, country
        # Existing output: output[idx] = f"{flat_number}\t{building_name}\t{street_number}\t{street_name}\t{town}\t{outward}\t{inward}"
        # New output 9 columns:
        output[idx] = f"{flat_number}\t{building_name}\t{street_number}\t{street_name}\t{town}\t{outward}\t{inward}\t{county}\t{country}"

        # Progress bar update
        if progress_callback and len(addresses) > 1 and idx % 10 == 0:
            progress_callback(idx / len(addresses))

    # Final progress update
    if progress_callback:
        progress_callback(1.0)
    stats = {
        "total": len(addresses),
        "postcodes": postcode_count,
        "towns": town_count,
        "street_names": street_name_count,
        "street_numbers": street_number_count
    }

    output_str = "\n".join(output)
    return output, stats, unidentified_addresses, unidentified_postcodes, applied_autocorrects, unidentified_streets, rest_outputs, None, autocorrect_counts

def extract_flat_from_building(building_name, flat_number):
    """Whenever there is a word 'Flat' (or 'Flt'), extract the following number into flat_number and remove 'Flat X' from building name."""
    if not building_name:
        return flat_number, building_name
    # Match "Flat" or "Flt" (optional dot) followed by space and a number/identifier, anywhere in the string
    flat_pattern = r'\b(Flat|Flt)\.?\s+([A-Za-z0-9]+)\b'
    match = re.search(flat_pattern, building_name.strip(), re.IGNORECASE)
    if match:
        extracted_flat = match.group(2)
        # Remove the matched "Flat X" / "Flt X" from building name (strip and collapse spaces)
        remainder = (building_name[:match.start()] + building_name[match.end():]).strip()
        remainder = re.sub(r'\s+', ' ', remainder)
        return extracted_flat, remainder
    return flat_number, building_name


def check_town(town_name):
    """Check if a town name is valid (case/normalization-insensitive)."""
    if not town_name:
        return None, "Please enter a town name."
    norm = normalize_name(town_name)
    if norm in {normalize_name(p) for p in place_names}:
        return True, f"'{town_name}' is a valid town."
    else:
        return False, f"'{town_name}' is NOT a valid town."


def check_county(county_name):
    """Check if a county name is valid (case/normalization-insensitive)."""
    if not county_name:
        return None, "Please enter a county name."
    norm = normalize_name(county_name)
    if norm in {normalize_name(c) for c in counties}:
        return True, f"'{county_name}' is a valid county."
    else:
        return False, f"'{county_name}' is NOT a valid county."


def generate_test_csv(addresses, result_list, rest_outputs_local, crf_tags_list, crf_model, rest_outputs_normalized):
    """Generate detailed CSV for testing mode"""
    import datetime
    import csv as _csv
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"address_parser_test_results_{timestamp}.csv"
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = [
            'Original_Address',
            'Final_Flat_No',
            'Final_Building_Name',
            'Final_Street_No',
            'Final_Street_Name',
            'Final_Town',
            'Final_Postcode_Start',
            'Final_Postcode_End',
            'Rest_Text',
            'CRF_Tokens',
            'CRF_Tags',
            'Confidence_Overall',
            'Confidence_Min',
            'Confidence_Max',
            'Confidence_Avg'
        ]
        writer = _csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for i, (address, result_line) in enumerate(zip(addresses, result_list)):
            parts = result_line.split("\t")
            if len(parts) < 7:
                parts.extend([''] * (7 - len(parts)))
            rest_text = rest_outputs_local[i] if i < len(rest_outputs_local) else ''
            tokens = rest_outputs_normalized[i].split() if i < len(rest_outputs_normalized) else []
            tags = crf_tags_list[i] if i < len(crf_tags_list) else []
            # Calculate confidence scores
            confidence_overall = 0.0
            confidence_min = 0.0
            confidence_max = 0.0
            confidence_avg = 0.0
            if tokens and hasattr(crf_model, 'predict_marginals'):
                try:
                    from train_crf_address_ner import sent2features
                    features = sent2features(tokens)
                    marginals = crf_model.predict_marginals([features])[0]
                    confidences = []
                    for token_marginals in marginals:
                        if token_marginals:
                            max_conf = max(token_marginals.values())
                            confidences.append(max_conf)
                    if confidences:
                        confidence_min = min(confidences)
                        confidence_max = max(confidences)
                        confidence_avg = sum(confidences) / len(confidences)
                        confidence_overall = confidence_avg
                except Exception as e:
                    pass
            # Process CRF tags to extract fields
            building, street, number = [], [], []
            for token, tag in zip(tokens, tags):
                if tag.endswith('BUILDING'):
                    building.append(token)
                elif tag.endswith('STREET'):
                    street.append(token)
                elif tag.endswith('NUMBER'):
                    number.append(token)
            parts[1] = ' '.join(building)
            parts[2] = ' '.join(number)
            parts[3] = ' '.join(street)
            # Extract flat from building name
            flat_number, building_name = extract_flat_from_building(parts[1], parts[0])
            parts[0] = flat_number
            parts[1] = building_name
            writer.writerow({
                'Original_Address': address,
                'Final_Flat_No': parts[0],
                'Final_Building_Name': parts[1],
                'Final_Street_No': parts[2],
                'Final_Street_Name': parts[3],
                'Final_Town': parts[4],
                'Final_Postcode_Start': parts[5],
                'Final_Postcode_End': parts[6],
                'Rest_Text': rest_text,
                'CRF_Tokens': ' | '.join(tokens),
                'CRF_Tags': ' | '.join(tags),
                'Confidence_Overall': f"{confidence_overall:.4f}",
                'Confidence_Min': f"{confidence_min:.4f}",
                'Confidence_Max': f"{confidence_max:.4f}",
                'Confidence_Avg': f"{confidence_avg:.4f}"
            })
    return filename