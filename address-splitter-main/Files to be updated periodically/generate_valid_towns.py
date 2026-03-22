import pandas as pd
import pickle
import os

def smart_title(text):
    if pd.isnull(text):
        return ''
    return str(text).title().strip()

# ---- GB/UK Towns ----
# Folder containing OS Open Names CSVs
FOLDER_PATH = 'OS_OPEN_NAMES_APRIL_2025'  # Change as needed

dataframes = []
for filename in os.listdir(FOLDER_PATH):
    if filename.endswith('.csv'):
        file_path = os.path.join(FOLDER_PATH, filename)
        df = pd.read_csv(file_path, header=None, usecols=[2, 4, 7], names=['NAME1', 'ENGLISH_NAME', 'LOCAL_TYPE'])
        dataframes.append(df)

if dataframes:
    combined_df = pd.concat(dataframes, ignore_index=True)
    approved_types = [
        'City', 'Town', 'Village', 'Hamlet', 'Suburban Area', 'Other Settlement',
        'Other Coastal Landform', 'Island', 'Group Of Islands', 'Named Place',
        'Populated Place', 'Locality', 'Other Built-Up Area', 'District',
        'Electoral Division', 'Coastal Headland'
    ]
    filtered_df = combined_df[combined_df['LOCAL_TYPE'].isin(approved_types)]
    place_names = set(filtered_df['NAME1'].apply(smart_title).str.strip())
    english_names = filtered_df['ENGLISH_NAME'].dropna().apply(smart_title).str.strip()
    place_names.update(english_names)
    with open('../Pickles/valid_place_names.pkl', 'wb') as f:
        pickle.dump(place_names, f)
    print(f'Saved {len(place_names)} GB/UK place names to Pickles/valid_place_names.pkl')
else:
    print('No OS Open Names CSV files found in the folder.')

# ---- Northern Ireland Towns ----
NI_FILE = 'ONSPD_NI_JULY_2025_UK.csv'  # Change as needed
if os.path.exists(NI_FILE):
    ni_df = pd.read_csv(NI_FILE)
    ni_places = set(ni_df['PLACENAME'].dropna().apply(smart_title).str.strip())
    with open('../Pickles/valid_place_names_NI.pkl', 'wb') as f:
        pickle.dump(ni_places, f)
    print(f'Saved {len(ni_places)} NI place names to Pickles/valid_place_names_NI.pkl')
else:
    print('No NI CSV file found. Skipping NI place names.')
