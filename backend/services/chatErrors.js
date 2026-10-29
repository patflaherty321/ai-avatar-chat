const ERROR_TYPES = Object.freeze({
  CONFIGURATION_ERROR: [503, 'Service configuration error', 'Echo is temporarily unavailable. Please try again later.'],
  MODEL_UNAVAILABLE: [503, 'Model unavailable', 'Echo is temporarily unavailable. Please try again later.'],
  RATE_LIMITED: [429, 'Too many requests', 'Echo is busy right now. Please wait a moment and try again.'],
  AI_TIMEOUT: [504, 'Response timed out', 'Echo took too long to respond. Please try again.'],
  AI_UNAVAILABLE: [502, 'Response unavailable', 'Echo could not respond right now. Please try again.'],
  EMPTY_RESPONSE: [502, 'Empty response', 'Echo could not prepare a response. Please try again.'],
  SPEECH_TIMEOUT: [504, 'Speech timed out', 'Echo took too long to prepare audio. Please try again.'],
  SPEECH_UNAVAILABLE: [502, 'Speech unavailable', 'Echo could not prepare audio. Please try again.'],
  INVALID_REQUEST: [400, 'Invalid request', 'Please enter a message and try again.'],
  INTERNAL_ERROR: [500, 'Internal error', 'Something went wrong. Please try again.']
});

// Provider error bodies and arbitrary strings must never reach logs or clients.
const SAFE_UPSTREAM_CODES = new Set([
  'invalid_api_key', 'model_not_found', 'model_not_available', 'unsupported_model',
  'model_access_denied', 'rate_limit_exceeded', 'insufficient_quota',
  'server_error', 'internal_error', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'
]);

function upstreamMetadata(error) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status : null;
  const code = (typeof error?.code === 'string' && SAFE_UPSTREAM_CODES.has(error.code)) ||
    (Number.isInteger(error?.code) && error.code >= 0 && error.code <= 8)
    ? error.code : null;
  return { upstreamStatus: status, upstreamCode: code };
}

class ChatError extends Error {
  constructor(code, upstream) {
    const [status, label, message] = ERROR_TYPES[code] || ERROR_TYPES.INTERNAL_ERROR;
    super(message);
    this.name = 'ChatError';
    this.code = ERROR_TYPES[code] ? code : 'INTERNAL_ERROR';
    this.status = status;
    this.label = label;
    Object.assign(this, upstreamMetadata(upstream));
  }
}

function abortError() {
  const error = new Error('Request disconnected');
  error.name = 'AbortError';
  return error;
}

function mapAIError(error) {
  if (error instanceof ChatError) return error;
  if (error?.status === 401 || error?.status === 403) return new ChatError('CONFIGURATION_ERROR', error);
  if (error?.status === 404 || ['model_not_found', 'model_not_available', 'unsupported_model', 'model_access_denied'].includes(error?.code)) {
    return new ChatError('MODEL_UNAVAILABLE', error);
  }
  if (error?.status === 429) return new ChatError('RATE_LIMITED', error);
  if (error?.name === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') return new ChatError('AI_TIMEOUT', error);
  return new ChatError('AI_UNAVAILABLE', error);
}

function errorBody(error, requestId) {
  const safeError = error instanceof ChatError ? error : new ChatError('INTERNAL_ERROR');
  return { success: false, error: safeError.label, message: safeError.message, code: safeError.code, requestId };
}

module.exports = { ChatError, abortError, mapAIError, errorBody };
