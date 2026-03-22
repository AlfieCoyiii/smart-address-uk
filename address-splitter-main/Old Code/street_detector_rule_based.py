# Backup of removed functions from address_parsing_core.py

def find_street(words, town_start_idx, idx):
    max_street_len = 4  # Increased to handle longer street names
    # Find the last number before the town (if any)
    last_number_idx = None
    for i in range(town_start_idx - 1, -1, -1):
        if words[i].isdigit() or (words[i].isalnum() and any(c.isdigit() for c in words[i])):
            last_number_idx = i
            break
    # Only search for street names after the last number (if any)
    search_start = last_number_idx + 1 if last_number_idx is not None else 0
    # First pass: Look for multi-word streets (prioritize these)
    for skip in range(0, town_start_idx - search_start):
        check_end = town_start_idx - skip
        for length in range(max_street_len, 1, -1):  # Start with 2+ word streets
            check_start = check_end - length
            if check_start < search_start:
                continue
            candidate_words = words[check_start:check_end]
            candidate = ' '.join(candidate_words).title().strip()
            normalized_candidate = normalize_name(candidate)
            # Exclude one-word suffixes
            if length == 1 and candidate in street_suffixes:
                continue
            if normalized_candidate in formatted_street_names:
                return formatted_street_names[normalized_candidate], check_start, length, None
    # Second pass: Look for single-word streets, but check if there's a better multi-word street before
    for skip in range(0, town_start_idx - search_start):
        check_end = town_start_idx - skip
        if check_end <= search_start:
            continue
        # Check for single-word street
        candidate_word = words[check_end - 1].title().strip()
        if candidate_word in street_suffixes:
            continue  # Skip pure suffixes
        normalized_candidate = normalize_name(candidate_word)
        if normalized_candidate in formatted_street_names:
            # Check if this single-word street is also a place name (avoid ambiguity)
            if normalized_candidate in {normalize_name(p) for p in place_names}:
                continue
            # Found a single-word street, but let's check if there's a better multi-word street before it
            better_street_start = check_end - 1
            for lookback in range(2, min(5, check_end - search_start)):
                lookback_start = check_end - 1 - lookback
                if lookback_start < search_start:
                    continue
                lookback_candidate = ' '.join(words[lookback_start:check_end-1]).title().strip()
                lookback_normalized = normalize_name(lookback_candidate)
                if lookback_normalized in formatted_street_names:
                    return formatted_street_names[lookback_normalized], lookback_start, lookback, None
            return formatted_street_names[normalized_candidate], check_end - 1, 1, None
    # Third pass: Pattern matching for "number + word + suffix" (existing logic)
    for i in range(search_start + 2, town_start_idx):  # Need at least 3 words: number + word + suffix
        if i >= len(words):
            continue
        current_word = words[i].title().strip()
        if current_word in street_suffixes:
            prev_word = words[i-1].title().strip()
            if not prev_word.isdigit():
                if i-2 >= search_start and (words[i-2].isdigit() or (words[i-2].isalnum() and not words[i-2].isalpha())):
                    street_name = f"{prev_word} {current_word}"
                    return street_name, i-1, 2, None
    # Fourth pass: Try joining first two words of 3-word combinations we checked before
    for skip in range(0, town_start_idx - search_start):
        check_end = town_start_idx - skip
        for length in range(3, 2, -1):  # Only check 3-word combinations
            check_start = check_end - length
            if check_start < search_start:
                continue
            candidate_words = words[check_start:check_end]
            if len(candidate_words) == 3:
                # Join first two words and keep the third
                joined_candidate = f"{candidate_words[0].title()} {candidate_words[1].title()} {candidate_words[2].title()}".strip()
                normalized_joined = normalize_name(joined_candidate)
                if normalized_joined in formatted_street_names:
                    return formatted_street_names[normalized_joined], check_start, length, None
                # Also try joining first two words into one compound word
                compound_candidate = f"{candidate_words[0].title()}{candidate_words[1].title()} {candidate_words[2].title()}".strip()
                normalized_compound = normalize_name(compound_candidate)
                if normalized_compound in formatted_street_names:
                    return formatted_street_names[normalized_compound], check_start, length, None
    return None, None, None, None

# split_number_single_letter logic (from inside parse_address_multi):
def split_number_single_letter(word):
    import re
    m = re.match(r'^\d+[A-Za-z]?$|^\d+$', word)
    if m:
        return word, ''
    m2 = re.match(r'^(\d+)([A-Za-z]+)$', word)
    if m2:
        num, letters = m2.groups()
        if len(letters) == 1:
            return num + letters, ''
        else:
            return num, letters
    return word, ''
