package app.wingtipmaps.gateway.security;

/**
 * Where the browser may fetch Studio's on-device speech model from (connect-src): transformers.js
 * downloads the Whisper weights (onnx-community/whisper-base, Apache-2.0) from Hugging Face, which
 * redirects each file to its AWS CDN in the US or the EU. Listed host by host, as the policy allows
 * no wildcard (SecurityRulesTest).
 */
final class ModelHosts {
    static final String CONNECT = "https://huggingface.co https://us.aws.cdn.hf.co https://eu.aws.cdn.hf.co";

    private ModelHosts() {}
}
