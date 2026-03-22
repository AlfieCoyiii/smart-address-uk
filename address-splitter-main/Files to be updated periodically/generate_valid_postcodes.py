import pandas as pd
import pickle

# Set the filename of your manually downloaded ONSPD CSV file
ONSPD_CSV = 'ONSPD_MAY_2025_UK.csv'  # Change as needed

# Load the ONSPD data
onspd_df = pd.read_csv(ONSPD_CSV)

# Extract valid postcodes (remove spaces, uppercase, strip)
valid_postcodes = set(onspd_df['pcd'].str.upper().str.replace(' ', '').str.strip())

# Save to pickle
with open('../Pickles/valid_postcodes.pkl', 'wb') as f:
    pickle.dump(valid_postcodes, f)

print(f'Saved {len(valid_postcodes)} postcodes to Pickles/valid_postcodes.pkl')
