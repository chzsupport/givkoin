import logging
from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Global variables for model and tokenizer
MODEL_NAME = "facebook/nllb-200-distilled-600M"
tokenizer = None
model = None

# Language code mapping for NLLB
# Simple codes (en, ru) -> NLLB codes (eng_Latn, rus_Cyrl)
LANG_MAP = {
    'en': 'eng_Latn',
    'ru': 'rus_Cyrl'
}

def load_model():
    """
    Loads the NLLB model and tokenizer.
    """
    global tokenizer, model
    try:
        logger.info(f"Loading model {MODEL_NAME}...")
        tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
        logger.info("Model and tokenizer loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        # We don't exit here, so the server can start, but translation will fail
        pass

@app.route('/health', methods=['GET'])
def health():
    status = "ok" if model and tokenizer else "loading_or_error"
    return jsonify({"status": status, "service": "nllb-translation-server"})

@app.route('/translate', methods=['POST'])
def translate_text():
    """
    Expects JSON: { "q": "text", "source": "en", "target": "ru" }
    """
    if not model or not tokenizer:
        return jsonify({"error": "Model not loaded"}), 503

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    q = data.get('q')
    source_lang_simple = data.get('source', 'en')
    target_lang_simple = data.get('target', 'ru')
    
    if not q:
        return jsonify({"translatedText": ""}), 200
        
    if source_lang_simple == target_lang_simple:
        return jsonify({"translatedText": q}), 200

    # Map to NLLB codes
    source_lang = LANG_MAP.get(source_lang_simple)
    target_lang = LANG_MAP.get(target_lang_simple)

    if not source_lang or not target_lang:
        return jsonify({"error": f"Unsupported language pair: {source_lang_simple} -> {target_lang_simple}"}), 400

    try:
        # Translation logic
        tokenizer.src_lang = source_lang
        inputs = tokenizer(q, return_tensors="pt")
        
        # Generate translation
        # forced_bos_token_id is required to specify target language
        # For NllbTokenizerFast, we can use convert_tokens_to_ids or check additional_special_tokens_ids
        forced_bos_token_id = tokenizer.convert_tokens_to_ids(target_lang)
        
        with torch.no_grad():
            generated_tokens = model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                max_length=512 # Set a reasonable max length
            )
        
        translated_text = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        
        return jsonify({"translatedText": translated_text})

    except Exception as e:
        logger.error(f"Translation error: {e}")
        return jsonify({"error": str(e), "translatedText": q}), 500

if __name__ == '__main__':
    # Load model on startup
    load_model()
    port = 5001
    logger.info(f"Starting NLLB Translation Server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
