import json
import logging
import re
from dataclasses import dataclass
from email.utils import parseaddr
from pathlib import Path
from typing import Any, List, Dict, Tuple
from urllib.parse import urlparse

import requests

try:
    import numpy as np
except ImportError:
    np = None

try:
    from fastembed import TextEmbedding
except ImportError:
    TextEmbedding = None

# Global variables to store our models and data in memory so we don't have to load them every time
GLOBAL_EMBEDDING_MODEL = None
CACHED_TRAINING_EXAMPLES = []

logger = logging.getLogger(__name__)

# Import settings to get API keys safely from our config file
from app.config import get_settings
app_settings = get_settings()

# Define sets of words to look for in emails. 
# We use full, descriptive variable names.
SENSITIVE_WORDS = [
    "password", "otp", "2fa", "verify", "account",
    "payment", "refund", "invoice", "bank", "wire"
]

URGENCY_WORDS = [
    "urgent", "immediately", "now", "expires",
    "limited", "final warning", "suspended", "locked"
]

URL_SHORTENER_DOMAINS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl",
    "rb.gy", "cutt.ly", "is.gd", "ow.ly"
]

TRUSTED_SENDER_DOMAINS = [
    "google.com", "youtube.com", "linkedin.com",
    "github.com", "amazon.com", "microsoft.com", "apple.com"
]

@dataclass
class TrainingExample:
    """
    A simple class to hold information about a past email we learned from.
    This makes it easier to pass data around instead of using raw dictionaries.
    """
    label: str
    subject: str
    sender: str
    snippet: str
    body_text: str
    reason: str
    sender_domain: str
    embedding_vector: Any = None


def get_embedding_model() -> Any:
    """
    Loads the machine learning model that turns text into lists of numbers (embeddings).
    We only load it once and save it to a global variable to save time and memory.
    """
    global GLOBAL_EMBEDDING_MODEL
    
    if TextEmbedding is None:
        logger.warning("fastembed library is missing!")
        return None
        
    if GLOBAL_EMBEDDING_MODEL is None:
        # This is a small, efficient model used for creating embeddings
        GLOBAL_EMBEDDING_MODEL = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        
    return GLOBAL_EMBEDDING_MODEL


def extract_domain_from_email_address(sender_email_string: str) -> str:
    """
    Extracts the domain name from an email address.
    For example, it takes "John Doe <john@example.com>" and returns "example.com".
    """
    name_part, email_address_part = parseaddr(sender_email_string)
    
    if "@" not in email_address_part:
        return ""
        
    # Split the email string at the '@' symbol
    parts_around_at_symbol = email_address_part.split("@", 1)
    
    # We want the second part (the domain)
    domain_part = parts_around_at_symbol[1]
    
    return domain_part.lower().strip()


def find_all_urls_in_text(text_to_search: str) -> List[str]:
    """
    Finds all web addresses starting with http:// or https:// in the text.
    Uses a simple regular expression.
    """
    if not text_to_search:
        return []
        
    url_pattern = r"https?://[^\s)>\"']+"
    found_urls = re.findall(url_pattern, text_to_search, flags=re.IGNORECASE)
    
    return found_urls


def load_all_training_examples() -> List[TrainingExample]:
    """
    Reads the jsonl file containing past emails and creates TrainingExample objects.
    We cache the result so we don't have to read the file every time a new email arrives.
    """
    global CACHED_TRAINING_EXAMPLES
    
    if len(CACHED_TRAINING_EXAMPLES) > 0:
        return CACHED_TRAINING_EXAMPLES
        
    # Find the correct path to the training data file
    file_path_for_data = Path(__file__).resolve().parents[2] / "datasets" / "training_data.jsonl"
    
    if not file_path_for_data.exists():
        logger.warning(f"Could not find training data file at {file_path_for_data}")
        return []

    loaded_examples_list = []
    texts_to_turn_into_numbers_list = []
    
    try:
        # Open and read the file line by line
        with open(file_path_for_data, "r", encoding="utf-8") as file_handle:
            for line_of_text in file_handle:
                line_of_text = line_of_text.strip()
                if not line_of_text:
                    continue
                    
                # Convert the individual line from JSON string format to a Python dictionary format
                try:
                    parsed_json_dictionary = json.loads(line_of_text)
                except json.JSONDecodeError:
                    continue
                    
                label_string = str(parsed_json_dictionary.get("label", "")).strip().lower()
                
                # We only want valid labels
                if label_string not in ["safe", "suspicious", "phishing"]:
                    continue
                    
                loaded_examples_list.append(parsed_json_dictionary)
                
                # Combine the text parts to feed it into the embedding model
                subject_text = str(parsed_json_dictionary.get("subject", ""))
                sender_text = str(parsed_json_dictionary.get("sender", ""))
                snippet_text = str(parsed_json_dictionary.get("snippet", ""))
                body_text = str(parsed_json_dictionary.get("body_text", ""))
                
                # Take only the first 900 characters of the body to keep the processing fast
                short_body_text = body_text[:900]
                
                combined_text_for_model = f"{subject_text}\n{sender_text}\n{snippet_text}\n{short_body_text}"
                texts_to_turn_into_numbers_list.append(combined_text_for_model)

    except Exception as error_reading_file:
        logger.warning(f"Failed to read training file: {error_reading_file}")
        return []

    if len(loaded_examples_list) == 0:
        return []

    # Get the embedding vectors for all texts at once to gain performance
    try:
        embedding_model = get_embedding_model()
        if embedding_model is None:
            return []
            
        list_of_embeddings = list(embedding_model.embed(texts_to_turn_into_numbers_list))
    except Exception as error_embedding:
        logger.warning(f"Failed to create embeddings: {error_embedding}")
        return []

    # Create the final TrainingExample objects to easily use in our logic later
    final_list_of_example_objects = []
    
    for index_number in range(len(loaded_examples_list)):
        current_dictionary = loaded_examples_list[index_number]
        current_embedding = list_of_embeddings[index_number]
        
        sender_string = str(current_dictionary.get("sender", ""))
        
        new_example_object = TrainingExample(
            label=str(current_dictionary.get("label", "")).strip().lower(),
            subject=str(current_dictionary.get("subject", "")),
            sender=sender_string,
            snippet=str(current_dictionary.get("snippet", "")),
            body_text=str(current_dictionary.get("body_text", "")),
            reason=str(current_dictionary.get("reason", "")),
            sender_domain=extract_domain_from_email_address(sender_string),
            embedding_vector=current_embedding
        )
        final_list_of_example_objects.append(new_example_object)

    # Save to our global cache variable
    CACHED_TRAINING_EXAMPLES = final_list_of_example_objects
    return CACHED_TRAINING_EXAMPLES


def calculate_similarity_score(example_vector: Any, query_vector: Any) -> float:
    """
    Calculates how mathematically similar two email texts are using dot product.
    Returns a number between 0 and 1, where 1 means identical.
    """
    if example_vector is None or query_vector is None:
        return 0.0
        
    if np is None:
        return 0.0
        
    similarity_number = float(np.dot(query_vector, example_vector))
    return similarity_number


def find_similar_past_emails(subject: str, sender: str, snippet: str, body_text: str, number_to_return: int = 5) -> List[Tuple[TrainingExample, float]]:
    """
    Looks at past emails and finds the ones that are most similar to the current email context based on their mathematical meaning (embeddings).
    """
    all_past_examples = load_all_training_examples()
    if len(all_past_examples) == 0:
        return []

    short_body = body_text[:900] if body_text else ""
    query_text_combined = f"{subject}\n{sender}\n{snippet}\n{short_body}"
    
    try:
        embedding_model = get_embedding_model()
        if embedding_model is None:
            return []
            
        # The embed() function returns a generator, so we convert it to a list and pick the first item
        query_embedding_vector = list(embedding_model.embed([query_text_combined]))[0]
    except Exception as error_while_embedding:
        logger.warning(f"Failed to embed query: {error_while_embedding}")
        return []

    email_scores_list = []
    
    for past_example in all_past_examples:
        similarity_score = calculate_similarity_score(past_example.embedding_vector, query_embedding_vector)
        
        # Give a small bonus number if the emails come from the exact same domain
        current_email_domain = extract_domain_from_email_address(sender)
        
        if current_email_domain != "" and current_email_domain == past_example.sender_domain:
            similarity_score = similarity_score + 0.2
            
        # We only care about emails that are similar enough 
        if similarity_score > 0.3:
            email_scores_list.append((past_example, similarity_score))

    # Sort the list from highest score to lowest score using the score value (item[1])
    email_scores_list.sort(key=lambda item: item[1], reverse=True)
    
    return email_scores_list[:number_to_return]


def create_technical_findings(subject: str, sender: str, snippet: str, body_text: str) -> Tuple[int, List[str]]:
    """
    Checks the email for suspicious patterns using simple rules, like checking for IP addresses in links or urgent tones.
    Returns a score out of 100, and a list of human-readable findings strings.
    """
    list_of_findings = []
    risk_score = 0
    
    # Combine everything to lower case so we can search easily
    combined_email_text = f"{subject} {snippet} {body_text}".lower()
    
    # Check for URLs in either body or snippet
    found_urls = find_all_urls_in_text(body_text)
    if len(found_urls) == 0:
        found_urls = find_all_urls_in_text(snippet)
        
    for single_url in found_urls[:10]:
        try:
            parsed_url_object = urlparse(single_url)
            host_name_string = str(parsed_url_object.hostname).lower()
        except Exception:
            risk_score = risk_score + 15
            list_of_findings.append(f"Found a broken or malformed URL: {single_url}")
            continue

        # Check if the URL is just raw numbers (an IP address) instead of a normal internet domain name
        ip_address_regular_expression_pattern = r"(?:\d{1,3}\.){3}\d{1,3}"
        
        if re.fullmatch(ip_address_regular_expression_pattern, host_name_string):
            risk_score = risk_score + 25
            list_of_findings.append("Link goes directly to an IP address instead of a domain name. This is highly suspicious.")

        # Check if they are hiding the final destination behind a URL shortener
        if host_name_string in URL_SHORTENER_DOMAINS:
            risk_score = risk_score + 10
            list_of_findings.append(f"A URL shortener ({host_name_string}) is used, hiding the link's true destination.")

    # Check for sensitive words and urgency words that might try to rush the user
    contains_sensitive_word = False
    for word in SENSITIVE_WORDS:
        if word in combined_email_text:
            contains_sensitive_word = True
            break
            
    contains_urgent_word = False
    for word in URGENCY_WORDS:
        if word in combined_email_text:
            contains_urgent_word = True
            break
            
    if contains_sensitive_word and contains_urgent_word:
        risk_score = risk_score + 20
        list_of_findings.append("Email creates false urgency while asking for sensitive account or payment details.")

    # Make sure the score never goes mathematically over 100
    if risk_score > 100:
        risk_score = 100
        
    return risk_score, list_of_findings


def ask_large_language_model(prompt_text: str) -> Dict[str, Any]:
    """
    Sends the email details to the Groq AI API and asks for a simple JSON response.
    This acts as the 'second pair of eyes'.
    """
    api_key_for_groq = app_settings.groq_api_key
    if not api_key_for_groq:
        raise ValueError("No Groq API key found in the settings configuration.")
        
    system_instructions = (
        "You are an email security assistant. Your job is to decide if an email is phishing, suspicious, or safe.\n"
        "Please provide the result in JSON format with exactly three keys:\n"
        "1. 'label' (must be exactly 'safe', 'suspicious', or 'phishing')\n"
        "2. 'confidence' (a number between 0 and 100 showing how sure you are)\n"
        "3. 'reason' (a short, clear one-sentence explanation of your decision)"
    )

    try:
        response_from_api = requests.post(
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key_for_groq}",
                "Content-Type": "application/json",
            },
            json={
                "model": app_settings.groq_model,
                "temperature": 0.0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_instructions},
                    {"role": "user", "content": prompt_text},
                ],
            },
            timeout=30,  # Wait a maximum of 30 seconds
        )
        # Check if the API request worked
        response_from_api.raise_for_status()
        
        parsed_api_response_dictionary = response_from_api.json()
        
        # Navigate through the JSON object to get the text message
        text_content_from_ai = parsed_api_response_dictionary["choices"][0]["message"]["content"]
        
        # Convert the string returned by AI into a Python dictionary
        ai_result_dictionary = json.loads(text_content_from_ai)
        return ai_result_dictionary
        
    except Exception as error_calling_api:
        logger.error(f"Error calling LLM: {error_calling_api}")
        raise


def learn_from_feedback(subject: str, sender: str, snippet: str, body_text: str, label: str, reason: str = "") -> None:
    """
    Saves a user's feedback into the training data file so the AI can remember it next time.
    """
    global CACHED_TRAINING_EXAMPLES
    
    file_path_for_data = Path(__file__).resolve().parents[2] / "datasets" / "training_data.jsonl"
    
    # Fallback check to avoid bad data
    if label not in ["safe", "suspicious", "phishing"]:
        label = "suspicious"
        
    if reason == "":
        reason = f"User marked this as {label}"
        
    new_email_example_object = {
        "label": label,
        "subject": subject,
        "sender": sender,
        "snippet": snippet,
        "body_text": body_text,
        "reason": reason,
    }
    
    try:
        # Open the file in Append mode ("a") to add to the bottom
        with open(file_path_for_data, "a", encoding="utf-8") as file_handle:
            file_handle.write(json.dumps(new_email_example_object) + "\n")
            
        # Empty the cache variable so it will be freshly reloaded next time it is needed
        CACHED_TRAINING_EXAMPLES = []
        logger.info(f"Successfully saved user feedback for sender: {sender}")
    except Exception as error_saving_file:
        logger.error(f"Could not save feedback to file: {error_saving_file}")


def format_findings_into_single_string(findings_list: List[str]) -> str:
    """
    Takes a list of reasons and joins them together into a single string to show the user.
    """
    if len(findings_list) == 0:
        return "No specific technical issues found."
        
    # Remove duplicate findings to keep it clean
    unique_findings_list = []
    for finding in findings_list:
        if finding not in unique_findings_list:
            unique_findings_list.append(finding)
            
    # Join everything up with a separator, limit to just the top 4
    return " | ".join(unique_findings_list[:4])


def classify_email(subject: str, sender: str, snippet: str, body_text: str) -> Dict[str, Any]:
    """
    The main coordinator function that takes an email and decides if it is safe, suspicious, or phishing.
    It calls the sub-functions in a clear, readable step-by-step process.
    """
    # Step 1: Check if the sender is from a domain we strongly trust automatically
    email_domain_string = extract_domain_from_email_address(sender)
    
    if email_domain_string in TRUSTED_SENDER_DOMAINS:
        return {
            "label": "safe",
            "confidence": 95,
            "reason": f"Email comes from a highly trusted domain ({email_domain_string})."
        }

    # Step 2: Check for technical red flags (like bad links or urgent words)
    technical_score_number, technical_findings_list = create_technical_findings(
        subject=subject,
        sender=sender,
        snippet=snippet,
        body_text=body_text
    )

    # Step 3: Check memory to see if we've seen emails behaving like this before
    similar_past_emails_list = find_similar_past_emails(
        subject=subject,
        sender=sender,
        snippet=snippet,
        body_text=body_text
    )
    
    similar_emails_summary_text = "No similar past emails found."
    
    if len(similar_past_emails_list) > 0:
        lines_to_show_to_ai_list = []
        for past_example, math_score in similar_past_emails_list:
            # We only show the most important details to the AI
            lines_to_show_to_ai_list.append(f"Label: {past_example.label}, Subject: {past_example.subject}")
        similar_emails_summary_text = "\n".join(lines_to_show_to_ai_list)

    # Step 4: Fallback plan if we don't have an API key for the AI provided by the user
    if not app_settings.groq_api_key:
        fallback_label_string = "safe"
        if technical_score_number > 35:
            fallback_label_string = "suspicious"
        if technical_score_number > 60:
            fallback_label_string = "phishing"
            
        return {
            "label": fallback_label_string,
            "confidence": 70,
            "reason": format_findings_into_single_string(technical_findings_list)
        }

    # Step 5: Ask the AI for a final decision based on our technical checks and past context
    shortened_body_text = body_text[:2000] if body_text else ""
    text_prompt_to_send_to_ai = (
        f"Email Details:\n"
        f"Subject: {subject}\n"
        f"Sender: {sender}\n"
        f"Snippet: {snippet}\n"
        f"Body Text: {shortened_body_text}\n\n"
        f"Our Automated Checks Found These Technical Issues:\n"
        f"Technical Score: {technical_score_number}/100\n"
        f"Details: {technical_findings_list}\n\n"
        f"Past Similar Emails (Memory):\n"
        f"{similar_emails_summary_text}\n"
    )

    try:
        # We try to get the label from the LLM
        ai_response_dictionary = ask_large_language_model(text_prompt_to_send_to_ai)
        
        final_label_string = str(ai_response_dictionary.get("label", "suspicious")).lower()
        if final_label_string not in ["safe", "suspicious", "phishing"]:
            final_label_string = "suspicious"
            
        final_confidence_number = 0
        try:
            final_confidence_number = int(ai_response_dictionary.get("confidence", 50))
        except (ValueError, TypeError):
            final_confidence_number = 50
            
        # We combine the AI's reason with any technical issues we found
        combined_reason_string = str(ai_response_dictionary.get("reason", "No reason provided by AI."))
        if len(technical_findings_list) > 0:
            combined_reason_string = combined_reason_string + " | " + " | ".join(technical_findings_list[:2])

        return {
            "label": final_label_string,
            "confidence": final_confidence_number,
            "reason": combined_reason_string
        }
        
    except Exception:
        # If the AI request completely fails, gracefully fall back to our simple rules
        fallback_label_string = "safe"
        if technical_score_number > 35:
            fallback_label_string = "suspicious"
        if technical_score_number > 60:
            fallback_label_string = "phishing"
            
        reason_explanation_string = "AI service was unreachable to provide a complete scan."
        if len(technical_findings_list) > 0:
            reason_explanation_string = reason_explanation_string + " | " + format_findings_into_single_string(technical_findings_list)
            
        return {
            "label": fallback_label_string,
            "confidence": 60,
            "reason": reason_explanation_string
        }
