import re
import csv
import pickle
import json
from rapidfuzz import process, fuzz
import os

BASE_DIR = os.path.dirname(__file__)


def _parse_debug_log(message: str) -> None:
    """
    Parser trace logs include customer address text. Off by default so host logs (e.g. Render)
    do not retain payloads. Set ADDRESS_PARSE_DEBUG=1 locally when debugging parsing only.
    """
    if os.environ.get("ADDRESS_PARSE_DEBUG", "").strip().lower() in ("1", "true", "yes"):
        print(message, flush=True)

# ===================== AUTOCORRECT THRESHOLDS (ADJUST HERE) =====================
TOWN_AUTOCORRECT_THRESHOLD = 0.95
COUNTY_AUTOCORRECT_THRESHOLD = 0.95

# ===================== DO NOT AUTOCORRECT LIST =====================
with open(os.path.join(BASE_DIR, 'Data', 'do_not_autocorrect.csv'), newline='', encoding='utf-8') as f:
    DO_NOT_AUTOCORRECT = set(row[0] for row in csv.reader(f) if row)

manual_town_overrides = {"Rossendale", "Hull", "Sutton Coldfield", "Aberlour", "Cwmbran"}
excluded_town_names = {
    "Trent", "Street", "Park", "Marsh", "Close", "Avon", "Kent", "Grove", "Lane",
    "High Street", "High Street Green",
}


def _town_candidate_blocked_street_like(phrase_words):
    """
    Reject gazetteer town hits that look like thoroughfare names:
    any token 'street' or 'road', or last token 'st' / 'rd' (abbreviations).
    Last-token-only for st/rd avoids blocking places like 'St Helens'.
    """
    if not phrase_words:
        return False
    lowered = [w.strip(".,;:").lower() for w in phrase_words]
    if "street" in lowered or "road" in lowered:
        return True
    if lowered[-1] in ("st", "rd"):
        return True
    return False

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


def join_tokens_preserving_commas(original_address, tokens):
    """Rejoin parsed tokens using the separators that appeared in the source address."""
    if not tokens:
        return ""
    if len(tokens) == 1:
        return tokens[0]

    orig_lower = original_address.lower()
    positions = []
    cursor = 0
    for token in tokens:
        idx = orig_lower.find(token.lower(), cursor)
        if idx == -1:
            return " ".join(tokens)
        end = idx + len(token)
        positions.append((idx, end))
        cursor = end

    out = []
    for i, (start, end) in enumerate(positions):
        if i == 0:
            out.append(original_address[start:end])
        else:
            prev_end = positions[i - 1][1]
            out.append(original_address[prev_end:start] + original_address[start:end])
    return "".join(out)


def sanitize_field_edges(value):
    """Strip leading/trailing commas and surrounding whitespace from structured output fields."""
    if value is None:
        return ""
    return re.sub(r"^[\s,]+|[\s,]+$", "", str(value)).strip()


# Remove characters not usually found in UK addresses; keep Unicode letters/digits (\w), space, and . , / - ' \ ( ) &.
_ADDRESS_UNUSUAL_CHARS = re.compile(r"[^\w\s.,/'\\()&-]+", re.UNICODE)


def strip_unusual_address_characters(s: str) -> str:
    """Drop @, £, ^, %, etc.; keep common punctuation. Collapse spaces."""
    if not s:
        return s
    t = _ADDRESS_UNUSUAL_CHARS.sub("", s)
    return re.sub(r"\s+", " ", t).strip()


def blank_street_number_if_no_alnum(street_number: str) -> str:
    """Clear street number when it is only punctuation/symbols (e.g. lone '@')."""
    s = (street_number or "").strip()
    if not s:
        return ""
    if any(ch.isalnum() for ch in s):
        return s
    return ""


def normalize_name(name):
    name = name.replace('-', ' ').replace("'", "").replace('.', '').strip()
    return ' '.join(name.split()).title()

def normalize_substring(s):
    return re.sub(r'\s+', ' ', s.strip().lower())


def clear_street_name_if_duplicate_of_town(street_name: str, town: str) -> str:
    """Blank street when it matches town ignoring punctuation (see normalize_name)."""
    s = (street_name or "").strip()
    t = (town or "").strip()
    if not s or not t:
        return s
    if normalize_name(s).casefold() == normalize_name(t).casefold():
        return ""
    return s


# Post-CRF: single-token "street" that is only a bearing (e.g. "East" from "East Boldre").
_STREET_NAME_COMPASS_SINGLE_TOKEN = frozenset({
    "north", "south", "east", "west",
    "northeast", "northwest", "southeast", "southwest",
})


def clear_street_name_if_single_token_compass_bearing(street_name: str) -> str:
    """Blank street when it is exactly one token and a cardinal/intercardinal direction only."""
    s = (street_name or "").strip()
    if not s:
        return s
    parts = s.split()
    if len(parts) != 1:
        return s
    key = re.sub(r"[-\s]+", "", parts[0].casefold())
    if key in _STREET_NAME_COMPASS_SINGLE_TOKEN:
        return ""
    return s


def sanitize_crf_street_name(street_name: str, town: str) -> str:
    """Post-CRF street cleanup: duplicate of town, then disallowed single-token bearings."""
    s = clear_street_name_if_duplicate_of_town(street_name, town)
    return clear_street_name_if_single_token_compass_bearing(s)


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
    address = strip_unusual_address_characters(address)
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
    cleaned_address = re.sub(r',', ' ', cleaned_address)
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
            if normalized_candidate in excluded_town_names:
                continue
            return formatted_place_names[normalized_candidate]

        # Try candidate + suffixes (space and hyphen)
        for suffix in suffix_connectors:
            extended_space = (candidate_phrase + " " + suffix.title()).replace("'", "").strip()
            normalized_space = normalize_name(extended_space)
            if normalized_space in formatted_place_names:
                if normalized_space in excluded_town_names:
                    continue
                return formatted_place_names[normalized_space]

            extended_hyphen = (candidate_phrase + "-" + suffix.title()).replace("'", "").strip()
            normalized_hyphen = normalize_name(extended_hyphen)
            if normalized_hyphen in formatted_place_names:
                if normalized_hyphen in excluded_town_names:
                    continue
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
        if normalize_name(base_candidate) in excluded_town_names:
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
                    _parse_debug_log(f"DEBUG: Found country: {country}")
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
                    _parse_debug_log(f"DEBUG: Found traditional county: {tsc}")
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
                    _parse_debug_log(f"DEBUG: Found county: {county}")
                    # Map back to original indices
                    start = len(words) - len(filtered_words) + (len(filtered_words) - length)
                    end = start + length
                    return county, (start, end)
    return '', None

def parse_address_multi(
    addresses,
    progress_callback=None,
    allow_autocorrect_list=None,
    address_indices_to_parse=None,
    allow_without_postcode=False,
):
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
        subset_output, subset_stats, subset_unidentified, subset_unidentified_postcodes, subset_applied_autocorrects, subset_unidentified_streets, subset_rest_outputs, subset_town_spans_outputs, subset_autocorrect_counts = parse_address_multi(
            subset_addresses,
            progress_callback,
            subset_allow_autocorrect,
            allow_without_postcode=allow_without_postcode,
        )
        
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
        _parse_debug_log(f"DEBUG find_town: words={words}, start_idx={start_idx}, max_check={max_check}")

        for length in range(max_check, 0, -1):
            phrase_words = words[start_idx - length : start_idx]
            candidate_phrase = ' '.join(phrase_words).title().strip()
            normalized_candidate = normalize_name(candidate_phrase)
            _parse_debug_log(f"DEBUG find_town: checking length={length}, phrase_words={phrase_words}, candidate_phrase='{candidate_phrase}', normalized='{normalized_candidate}'")

            # O(1) lookup
            if normalized_candidate in formatted_place_names:
                _parse_debug_log(f"DEBUG find_town: MATCH FOUND! normalized_candidate='{normalized_candidate}' in formatted_place_names")
                if normalized_candidate in excluded_town_names:
                    _parse_debug_log(f"DEBUG find_town: but skipping because it's in excluded_town_names")
                    continue
                if _town_candidate_blocked_street_like(phrase_words):
                    _parse_debug_log("DEBUG find_town: skipping street/road/st/rd-shaped candidate")
                    continue
                _parse_debug_log(f"DEBUG find_town: returning '{formatted_place_names[normalized_candidate]}'")
                return formatted_place_names[normalized_candidate]

            # Try candidate + suffixes (space and hyphen)
            for suffix in suffix_connectors:
                extended_space = (candidate_phrase + " " + suffix.title()).replace("'", "").strip()
                normalized_space = normalize_name(extended_space)
                if normalized_space in formatted_place_names:
                    if normalized_space in excluded_town_names:
                        continue
                    if _town_candidate_blocked_street_like(phrase_words):
                        continue
                    return formatted_place_names[normalized_space]

                extended_hyphen = (candidate_phrase + "-" + suffix.title()).replace("'", "").strip()
                normalized_hyphen = normalize_name(extended_hyphen)
                if normalized_hyphen in formatted_place_names:
                    if normalized_hyphen in excluded_town_names:
                        continue
                    if _town_candidate_blocked_street_like(phrase_words):
                        continue
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
            if normalize_name(base_candidate) in excluded_town_names:
                continue
            for directional in directionals:
                combined = (directional + " " + base_candidate).strip()
                normalized_combined = normalize_name(combined)
                if normalized_combined in formatted_place_names:
                    if _town_candidate_blocked_street_like(combined.split()):
                        continue
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
        address = strip_unusual_address_characters(address)

        # Normalize: ensure every comma is followed by a space
        address = re.sub(r',(?=\S)', ', ', address)

        town = county = country = inward = outward = street_name = street_number = flat_number = building_name = ""
        words = []

        match = re.search(postcode_pattern, address, re.IGNORECASE)
        parse_location_fields = False

        if match:
            outward = match.group(1).upper()
            inward = match.group(2).upper()
            full_postcode = (outward + inward).replace(" ", "")
            postcode_count += 1
            parse_location_fields = bool(outward and inward)
        elif allow_without_postcode:
            outward = ""
            inward = ""
            parse_location_fields = True

        if parse_location_fields:
            if match and outward and inward:
                cleaned_address = re.sub(postcode_pattern, '', address, flags=re.IGNORECASE)
            else:
                cleaned_address = address
            cleaned_address = re.sub(r'[,\(\)]', '', cleaned_address).strip()
            cleaned_address = cleaned_address.replace('&', 'and')
            cleaned_address = re.sub(r'\.+$', '', cleaned_address).strip()

            # After postcode extraction and cleaning:
            words = cleaned_address.split()

            # Remove postcode from the end if present
            if words and re.fullmatch(postcode_pattern, words[-1], re.IGNORECASE):
                _parse_debug_log(f"DEBUG: Removing postcode from words: {words[-1]}")
                words = words[:-1]

            # Country detection (last 3, 2, 1 words)
            country = ''
            for length in range(3, 0, -1):
                if len(words) >= length:
                    candidate = ' '.join(words[-length:]).title().strip()
                    for c in countries:
                        if normalize_name(candidate) == normalize_name(c):
                            country = c
                            _parse_debug_log(f"DEBUG: Found country: {country}")
                            words = words[:-length]
                            break
                    if country:
                        break

            # Traditional Scottish county detection (last 2, 1 words) with directional support
            ts_county = ''
            for length in range(2, 0, -1):
                if len(words) >= length:
                    candidate = ' '.join(words[-length:]).title().strip()
                    _parse_debug_log(f"DEBUG tsc: checking length={length}, candidate='{candidate}'")
                    
                    # First try exact match
                    for tsc in traditional_scottish_counties:
                        if normalize_name(candidate) == normalize_name(tsc):
                            ts_county = tsc
                            _parse_debug_log(f"DEBUG: Found traditional county: {ts_county}")
                            words = words[:-length]
                            break
                    
                    # If no exact match and length > 1, try directional + county
                    if not ts_county and length > 1:
                        first_word = words[-(length)].title().strip()
                        remaining_words = words[-(length-1):]
                        remaining_candidate = ' '.join(remaining_words).title().strip()
                        
                        _parse_debug_log(f"DEBUG tsc: trying directional+county: first_word='{first_word}', remaining='{remaining_candidate}'")
                        
                        # Check if first word is directional and remaining is traditional Scottish county
                        if first_word in directionals:
                            for tsc in traditional_scottish_counties:
                                if normalize_name(remaining_candidate) == normalize_name(tsc):
                                    ts_county = tsc
                                    _parse_debug_log(f"DEBUG: Found traditional county with directional: {first_word} {remaining_candidate} -> {ts_county}")
                                    words = words[:-length]
                                    break
                    
                    if ts_county:
                        break

            county_autocorrected = False
            # County detection (last 3, 2, 1 words) with directional support
            county = ''
            county_removed_length = 0  # Track how many words were removed for the county
            _parse_debug_log(f"DEBUG county: words before county detection: {words}")
            for length in range(3, 0, -1):
                if len(words) >= length:
                    candidate = ' '.join(words[-length:]).title().strip()
                    _parse_debug_log(f"DEBUG county: checking length={length}, candidate='{candidate}'")
                    
                    # First try exact match
                    for c in counties:
                        if normalize_name(candidate) == normalize_name(c):
                            _parse_debug_log(f"DEBUG county: EXACT MATCH! '{candidate}' matches county '{c}'")
                            county = c
                            county_removed_length = length
                            _parse_debug_log(f"DEBUG county: words before removal: {words}")
                            words = words[:-length]
                            _parse_debug_log(f"DEBUG county: words after county removal: {words}")
                            
                            # Check if the word before the county was "Co." or "County" and remove it too
                            if len(words) > 0 and words[-1].lower() in ['co.', 'co', 'county']:
                                _parse_debug_log(f"DEBUG county: removing 'Co.' prefix: '{words[-1]}'")
                                words = words[:-1]
                                _parse_debug_log(f"DEBUG county: words after 'Co.' removal: {words}")
                            
                            break
                    
                    # If no exact match and length > 1, try directional + county
                    if not county and length > 1:
                        first_word = words[-(length)].title().strip()
                        remaining_words = words[-(length-1):]
                        remaining_candidate = ' '.join(remaining_words).title().strip()
                        
                        _parse_debug_log(f"DEBUG county: trying directional+county: first_word='{first_word}', remaining='{remaining_candidate}'")
                        
                        # Check if first word is directional and remaining is county
                        if first_word in directionals:
                            for c in counties:
                                if normalize_name(remaining_candidate) == normalize_name(c):
                                    _parse_debug_log(f"DEBUG county: DIRECTIONAL MATCH! '{first_word} {remaining_candidate}' -> county '{c}'")
                                    county = c
                                    county_removed_length = length  # Track that we removed directional + county
                                    _parse_debug_log(f"DEBUG county: words before removal: {words}")
                                    words = words[:-length]
                                    _parse_debug_log(f"DEBUG county: words after county removal: {words}")
                                    
                                    # Check if the word before the county was "Co." or "County" and remove it too
                                    if len(words) > 0 and words[-1].lower() in ['co.', 'co', 'county']:
                                        _parse_debug_log(f"DEBUG county: removing 'Co.' prefix: '{words[-1]}'")
                                        words = words[:-1]
                                        _parse_debug_log(f"DEBUG county: words after 'Co.' removal: {words}")
                                    
                                    break
                    
                    if county:
                        break
            
            # Check for back-to-back duplicate counties (e.g., "Hertfordshire Hertfordshire" or "East Hertfordshire East Hertfordshire")
            if county and county_removed_length > 0:
                _parse_debug_log(f"DEBUG duplicate county: county='{county}', removed_length={county_removed_length}, words={words}")
                
                # Check if the same number of words at the end match the base county (with or without directional)
                if len(words) >= county_removed_length:
                    last_n_words = words[-county_removed_length:]
                    candidate = ' '.join(last_n_words).title().strip()
                    _parse_debug_log(f"DEBUG duplicate county: checking if '{candidate}' forms same county pattern")
                    
                    # Case 1: If removed_length > 1, check if it's directional + county
                    if county_removed_length > 1:
                        first_word = last_n_words[0].title().strip()
                        remaining_words = last_n_words[1:]
                        remaining = ' '.join(remaining_words).title().strip()
                        
                        # Check if this is also directional + same county
                        if first_word in directionals and normalize_name(remaining) == normalize_name(county):
                            _parse_debug_log(f"DEBUG duplicate county: FOUND back-to-back duplicate with directional! '{first_word} {remaining}'")
                            words = words[:-county_removed_length]
                            _parse_debug_log(f"DEBUG duplicate county: words after duplicate removal: {words}")
                    
                    # Case 2: Check if it's just the county name (exact match)
                    if normalize_name(candidate) == normalize_name(county):
                        _parse_debug_log(f"DEBUG duplicate county: FOUND back-to-back duplicate! Removing '{candidate}'")
                        words = words[:-county_removed_length]
                        _parse_debug_log(f"DEBUG duplicate county: words after duplicate removal: {words}")
            
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
            _parse_debug_log(f"DEBUG: start_idx for town detection: {start_idx}")
            _parse_debug_log(f"DEBUG: words before town detection: {words}")
            _parse_debug_log(f"DEBUG: length of words: {len(words)}")
            
            # Debug: Check if any words contain town names
            for i, word in enumerate(words):
                if normalize_name(word) in normalized_places:
                    _parse_debug_log(f"DEBUG: Word {i} '{word}' is a town name!")
            
            # First pass: Try to find town normally (including directionals in case there's a town like "Hertford East")
            town = find_town(words, start_idx)
            _parse_debug_log(f"DEBUG: town found by find_town (first pass): '{town}'")
            
            # Second pass: If no town found, check if last 1-2 words are directionals
            # If so, temporarily ignore them and try town detection again
            directionals_to_remove = []
            if town == "":
                _parse_debug_log(f"DEBUG directional town: No town found, checking for trailing directionals")
                
                # Check if last 2 words are directionals (e.g., "North East")
                if len(words) >= 2:
                    last_two = ' '.join(words[-2:]).title().strip()
                    if last_two in directionals:
                        _parse_debug_log(f"DEBUG directional town: Last 2 words '{last_two}' are directional")
                        directionals_to_remove = words[-2:]
                        temp_words = words[:-2]
                        temp_start_idx = len(temp_words)
                        town = find_town(temp_words, temp_start_idx)
                        if town != "":
                            _parse_debug_log(f"DEBUG directional town: Found town '{town}' after ignoring directionals '{last_two}'")
                            words = temp_words  # Remove the directionals
                            start_idx = temp_start_idx
                        else:
                            directionals_to_remove = []  # Keep them if no town found
                
                # If still no town, check if last 1 word is directional
                if town == "" and len(words) >= 1:
                    last_one = words[-1].title().strip()
                    if last_one in directionals:
                        _parse_debug_log(f"DEBUG directional town: Last word '{last_one}' is directional")
                        directionals_to_remove = [words[-1]]
                        temp_words = words[:-1]
                        temp_start_idx = len(temp_words)
                        town = find_town(temp_words, temp_start_idx)
                        if town != "":
                            _parse_debug_log(f"DEBUG directional town: Found town '{town}' after ignoring directional '{last_one}'")
                            words = temp_words  # Remove the directional
                            start_idx = temp_start_idx
                        else:
                            directionals_to_remove = []  # Keep it if no town found
            
            _parse_debug_log(f"DEBUG: town found by find_town (after directional check): '{town}'")
            
            # Debug: Check what words remain after town detection
            _parse_debug_log(f"DEBUG: words after town detection: {words}")
            _parse_debug_log(f"DEBUG: start_idx after town detection: {start_idx}")
            
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
        # Commas → spaces for tokenisation; keep periods (e.g. unit "1.4") intact.
        cleaned = re.sub(r',', ' ', cleaned)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        # Always try to extract REST output, even if town or postcode not found
        rest = cleaned.strip()
        _parse_debug_log(f"DEBUG rest: initial cleaned='{cleaned}'")
        _parse_debug_log(f"DEBUG rest: initial rest='{rest}'")
        spans = []
        
        if town:
            town_idx = cleaned.lower().find(town.lower())
            _parse_debug_log(f"DEBUG rest: town='{town}', town_idx={town_idx}")
            if town_idx != -1:
                rest = cleaned[:town_idx].strip()
                _parse_debug_log(f"DEBUG rest: after removing town, rest='{rest}'")
        
        # After extracting the town, instead of '.replace', use this helper:
        def remove_trailing_town(text, town):
            # Remove trailing whole-word town (optionally after comma/space)
            pattern = r'(.*?)([, ]+)?\b' + re.escape(town) + r'\b\s*$'
            match = re.match(pattern, text, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip()
            return text
        rest = remove_trailing_town(cleaned, town)
        _parse_debug_log(f"DEBUG rest: after removing trailing town, rest='{rest}'")
        
        # Town spans
        # REMOVE: town_spans = detect_town_spans(rest, place_names)
        # Street spans
        # REMOVE: street_spans = detect_street_spans(rest, valid_street_names)
        # spans = town_spans + street_spans
        
        _parse_debug_log(f"DEBUG rest: FINAL rest for CRF='{rest}'")
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

_FLAT_UNIT_ID = re.compile(r"^[A-Za-z0-9]+(?:[/-][A-Za-z0-9]+)*$")
_AMBIGUOUS_FLAT_UNIT_PREFIX = re.compile(r"^(?P<prefix>.+)\s+(Flat|Flt)\.?$", re.IGNORECASE)


def _address_first_word_is_flat_keyword(address_line: str) -> bool:
    """
    True only when the first word of the address (after stripping postcode) is Flat/Flt.
    Used to gate flat-from-building rules so 'Upper Flat 3 ...' keeps CRF output intact.
    """
    if not address_line or not str(address_line).strip():
        return False
    line = re.sub(postcode_pattern, "", str(address_line), flags=re.IGNORECASE).strip()
    line = line.lstrip(" \t,;:")
    if not line:
        return False
    first = line.split()[0]
    first = re.sub(r"^[^\w]+|[^\w]+$", "", first).lower()
    return first in ("flat", "flt")


def _consolidate_ambiguous_flat_unit_prefix(flat_number, building_name, street_number):
    """Keep number + flat + number together in building when the unit order is unclear."""
    building_stripped = (building_name or "").strip()
    unit_id = (street_number or "").strip()
    if not building_stripped or not unit_id or not _FLAT_UNIT_ID.match(unit_id):
        return flat_number, building_name, street_number

    match = _AMBIGUOUS_FLAT_UNIT_PREFIX.match(building_stripped)
    if not match or not re.search(r"\d", match.group("prefix")):
        return flat_number, building_name, street_number

    return "", f"{building_stripped} {unit_id}", ""


def _promote_flat_label_from_street(flat_number, building_name, street_number):
    """When CRF labels only the word Flat as building and the unit id as street number."""
    building_stripped = (building_name or "").strip()
    unit_id = (street_number or "").strip()
    if building_stripped.lower() not in ("flat", "flt"):
        return flat_number, building_name, street_number
    if not unit_id or not _FLAT_UNIT_ID.match(unit_id):
        return flat_number, building_name, street_number
    if (flat_number or "").strip():
        return flat_number, "", ""
    return unit_id, "", ""


# Single-token building labels that often pair with a unit number in the street-number field (CRF split).
_LONE_UNIT_KEYWORDS = frozenset(
    {
        "apartment",
        "apt",
        "unit",
        "suite",
        "ste",
        "room",
        "rm",
        "penthouse",
        "studio",
        "maisonette",
        "duplex",
        "level",
        "lvl",
    }
)


def merge_lone_unit_keyword_with_street_number(building_name, street_number, flat_number=""):
    """
    If building is exactly one word from _LONE_UNIT_KEYWORDS and street_number is non-empty,
    join them into building and clear street_number (e.g. Apartment + 28 -> Apartment 28).
    Multi-word buildings (e.g. Upper Floor Apartment) are unchanged.
    Skipped when flat_number is already set (avoid conflicting unit fields).
    """
    if (flat_number or "").strip():
        return building_name, street_number
    b = (building_name or "").strip()
    s = (street_number or "").strip()
    if not b or not s:
        return b, s
    words = b.split()
    if len(words) != 1:
        return b, s
    raw = words[0]
    key = raw.rstrip(".,;:").lower()
    if key not in _LONE_UNIT_KEYWORDS:
        return b, s
    return f"{raw} {s}", ""


def flat_phrase_from_original(original_address: str, flat_number: str) -> str:
    """Return a Flat 3-style label from the source when flat_number is only the unit id."""
    flat_number = (flat_number or "").strip()
    if not flat_number:
        return ""
    if re.match(r"^(flat|flt|apartment|apt|suite|unit)\b", flat_number, re.IGNORECASE):
        return flat_number
    esc = re.escape(flat_number)
    match = re.search(
        rf"\b(Flat|Flt|Apartment|Apt|Suite|Unit)\.?\s+{esc}\b",
        original_address,
        re.IGNORECASE,
    )
    return match.group(0) if match else ""


def build_flat_and_building_line(
    original_address: str,
    flat_number: str,
    building_name: str,
) -> str:
    """Merge flat + building preserving Flat label and commas from the source address."""
    flat_number = (flat_number or "").strip()
    building_name = (building_name or "").strip()
    if not flat_number and not building_name:
        return ""
    if not flat_number:
        return sanitize_field_edges(building_name)
    if not building_name:
        phrase = flat_phrase_from_original(original_address, flat_number) or flat_number
        return sanitize_field_edges(phrase)

    flat_phrase = flat_phrase_from_original(original_address, flat_number)
    tokens: list[str] = []
    if flat_phrase:
        tokens.extend(flat_phrase.split())
    else:
        tokens.extend(flat_number.split())
    tokens.extend(building_name.split())
    return sanitize_field_edges(join_tokens_preserving_commas(original_address, tokens))


def build_address_line(
    original_address: str,
    flat_number: str,
    building_name: str,
    street_number: str,
    street_name: str,
) -> str:
    """Merge flat/building/street fields preserving commas from the source address."""
    tokens: list[str] = []
    flat_phrase = flat_phrase_from_original(original_address, flat_number)
    if flat_phrase:
        tokens.extend(flat_phrase.split())
    elif (flat_number or "").strip():
        tokens.extend(flat_number.split())
    for part in (building_name, street_number, street_name):
        p = (part or "").strip()
        if p:
            tokens.extend(p.split())
    if not tokens:
        return ""
    return sanitize_field_edges(join_tokens_preserving_commas(original_address, tokens))


def extract_flat_from_building(
    building_name,
    flat_number,
    street_number="",
    address_line=None,
    combine_flat_with_building: bool = False,
):
    """
    Extract flat identifiers from building text or from a Flat + street-number CRF split.

    When combine_flat_with_building is True, flat extraction is skipped (Flat stays in building).

    When address_line is set, these rules run only if the address starts with Flat/Flt
    (first word after stripping postcode), so e.g. 'Upper Flat 3 ...' is left as CRF output.

    When address_line is None, behaviour matches legacy callers (rules always apply).
    """
    if combine_flat_with_building:
        building_name, street_number = merge_lone_unit_keyword_with_street_number(
            building_name, street_number, flat_number
        )
        street_number = blank_street_number_if_no_alnum(street_number)
        return (
            sanitize_field_edges(flat_number),
            sanitize_field_edges(building_name),
            sanitize_field_edges(street_number),
        )

    apply_flat_rules = address_line is None or _address_first_word_is_flat_keyword(address_line)

    if apply_flat_rules and building_name:
        flat_pattern = r"\b(Flat|Flt)\.?\s+([A-Za-z0-9]+(?:[/-][A-Za-z0-9]+)*)\b"
        match = re.search(flat_pattern, building_name.strip(), re.IGNORECASE)
        if match:
            extracted_flat = match.group(2)
            remainder = (building_name[: match.start()] + building_name[match.end() :]).strip()
            remainder = re.sub(r"\s+", " ", remainder)
            flat_number = extracted_flat
            building_name = remainder

    if apply_flat_rules:
        flat_number, building_name, street_number = _consolidate_ambiguous_flat_unit_prefix(
            flat_number, building_name, street_number
        )
        flat_number, building_name, street_number = _promote_flat_label_from_street(
            flat_number, building_name, street_number
        )
    building_name, street_number = merge_lone_unit_keyword_with_street_number(
        building_name, street_number, flat_number
    )
    street_number = blank_street_number_if_no_alnum(street_number)
    return (
        sanitize_field_edges(flat_number),
        sanitize_field_edges(building_name),
        sanitize_field_edges(street_number),
    )


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
            parts[1] = join_tokens_preserving_commas(address, building)
            parts[2] = join_tokens_preserving_commas(address, number)
            parts[3] = sanitize_field_edges(" ".join(street))
            # Extract flat from building name
            flat_number, building_name, street_number = extract_flat_from_building(
                parts[1], parts[0], parts[2], address_line=address
            )
            parts[0] = flat_number
            parts[1] = building_name
            parts[2] = street_number
            parts[3] = sanitize_crf_street_name(parts[3], parts[4])
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