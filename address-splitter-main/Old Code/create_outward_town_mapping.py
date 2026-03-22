import pandas as pd
import pickle
import time
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable
import os

def extract_outward(postcode):
    """Extract outward code from full postcode (e.g., 'AB1 0AA' -> 'AB1')"""
    if pd.isna(postcode):
        return None
    # Remove spaces and take first part (before the space)
    clean_pc = str(postcode).replace(' ', '').upper()
    # Find where the space would be (or end of string)
    # The outward code is everything before the space in the original postcode
    if ' ' in str(postcode):
        # If there's a space, take everything before it
        return str(postcode).split(' ')[0].upper()
    else:
        # If no space, find where the inward code starts (last 3 characters)
        if len(clean_pc) >= 3:
            return clean_pc[:-3]
    return clean_pc

def clean_town_name(town_name):
    """Clean and standardize town names"""
    if not town_name:
        return None
    # Remove extra whitespace, convert to title case
    cleaned = str(town_name).strip().title()
    # Remove common suffixes that might cause confusion
    suffixes_to_remove = [' City', ' Town', ' Village', ' District', ' Borough']
    for suffix in suffixes_to_remove:
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
    return cleaned.strip()

def reverse_geocode_to_town(lat, lon, geolocator, max_retries=3):
    """Reverse geocode coordinates to find town name"""
    for attempt in range(max_retries):
        try:
            location = geolocator.reverse((lat, lon), timeout=10)
            if location:
                # Try to extract town name from various address fields
                address = location.raw.get('address', {})
                
                # Priority order for town names
                town_fields = ['city', 'town', 'village', 'suburb', 'district', 'county']
                for field in town_fields:
                    if field in address and address[field]:
                        return clean_town_name(address[field])
                
                # If no specific town field, try display_name
                display_name = location.raw.get('display_name', '')
                if display_name:
                    # Extract first part before comma
                    parts = display_name.split(',')
                    if len(parts) > 0:
                        return clean_town_name(parts[0].strip())
            
            return None
            
        except (GeocoderTimedOut, GeocoderUnavailable) as e:
            if attempt < max_retries - 1:
                print(f"Geocoding attempt {attempt + 1} failed, retrying...")
                time.sleep(2)  # Wait before retry
            else:
                print(f"Failed to geocode coordinates ({lat}, {lon}) after {max_retries} attempts")
                return None
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Unexpected error, retrying... Error: {e}")
                time.sleep(2)
            else:
                print(f"Failed to geocode coordinates ({lat}, {lon}) after {max_retries} attempts")
                return None

def create_outward_town_mapping():
    """Create mapping from outward codes to town names using geocoding"""
    print("Loading postcode coordinates data...")
    
    # Load the postcode coordinates (which already have lat/lon)
    try:
        postcode_coords_df = pd.read_pickle('Pickles/postcode_coords.pkl')
        print(f"Loaded {len(postcode_coords_df)} postcode coordinates")
    except Exception as e:
        print(f"Error loading postcode coordinates: {e}")
        return {}
    
    # Extract outward codes
    print("Extracting outward codes...")
    postcode_coords_df['outward'] = postcode_coords_df['pcd'].apply(extract_outward)
    
    # Group by outward code and get one representative coordinate for each
    outward_coords = {}
    for outward, group in postcode_coords_df.groupby('outward'):
        # Take the first coordinate for this outward code
        first_row = group.iloc[0]
        outward_coords[outward] = {
            'lat': first_row['lat'],
            'lon': first_row['long']
        }
    
    print(f"Found {len(outward_coords)} unique outward codes with coordinates")
    
    # Initialize geocoder
    print("Initializing geocoder...")
    geolocator = Nominatim(user_agent="address_parser_outward_mapping")
    
    # Create mapping
    outward_town_mapping = {}
    processed_count = 0
    
    print("Starting geocoding process...")
    
    for outward, coords in outward_coords.items():
        lat = coords['lat']
        lon = coords['lon']
        
        processed_count += 1
        if processed_count % 50 == 0:
            print(f"Processed {processed_count}/{len(outward_coords)} outward codes...")
        
        # Geocode to find town
        town = reverse_geocode_to_town(lat, lon, geolocator)
        
        if town:
            outward_town_mapping[outward] = town
            print(f"Mapped {outward} -> {town}")
        else:
            print(f"Could not find town for {outward}")
        
        # Rate limiting - be respectful to the geocoding service
        time.sleep(1)
    
    # Save to pickle file
    with open('Pickles/outward_town_mapping.pkl', 'wb') as f:
        pickle.dump(outward_town_mapping, f)
    
    # Also save as CSV for easy inspection
    mapping_df = pd.DataFrame(list(outward_town_mapping.items()), columns=['Outward', 'Town'])
    mapping_df.to_csv('Data/outward_town_mapping.csv', index=False)
    
    print(f"\nGenerated mapping for {len(outward_town_mapping)} outward codes")
    print("Files saved:")
    print("- Pickles/outward_town_mapping.pkl (for program use)")
    print("- Data/outward_town_mapping.csv (for inspection)")
    
    # Show some examples
    print("\nSample mappings:")
    for i, (outward, town) in enumerate(list(outward_town_mapping.items())[:10]):
        print(f"{outward} - {town}")
    
    return outward_town_mapping

if __name__ == "__main__":
    mapping = create_outward_town_mapping() 