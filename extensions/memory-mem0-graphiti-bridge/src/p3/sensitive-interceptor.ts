export type SensitiveInspection = {
  intercepted: boolean;
  reasons: string[];
};

export type CreateSensitiveInterceptorOptions = {
  keywords?: string[];
  regexes?: RegExp[];
  entropyThreshold?: number;
  tokenMinLength?: number;
};

const DEFAULT_KEYWORDS = [
  "password",
  "passcode",
  "api_key",
  "apikey",
  "secret",
  "private key",
  "token",
  "access token",
  "refresh token",
  "ssn",
  "social security",
  "credit card",
  "银行卡",
  "身份证",
  "密码",
];

const DEFAULT_REGEXES = [
  /\b\d{3}-\d{2}-\d{4}\b/, // US SSN
  /\b(?:4\d{3}|5[1-5]\d{2})[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // card-like
  /\b(?:sk|rk)_[a-z0-9]{16,}\b/i, // token-like secrets
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, // aws key prefix
];

const toNormalizedWords = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_\s-]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length > 0);
};

const entropy = (token: string): number => {
  const counts = new Map<string, number>();
  for (const char of token) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  const length = token.length;
  if (length <= 0) {
    return 0;
  }

  let score = 0;
  for (const count of counts.values()) {
    const probability = count / length;
    score -= probability * Math.log2(probability);
  }
  return score;
};

const findHighEntropyTokens = (
  text: string,
  params: { threshold: number; tokenMinLength: number },
): string[] => {
  const rawTokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= params.tokenMinLength);

  return rawTokens.filter((token) => {
    const cleanToken = token.replace(/[^a-zA-Z0-9]/g, "");
    if (cleanToken.length < params.tokenMinLength) {
      return false;
    }
    if (!/[a-z]/i.test(cleanToken) || !/[0-9]/.test(cleanToken)) {
      return false;
    }
    return entropy(cleanToken) >= params.threshold;
  });
};

export function createSensitiveInterceptor(options?: CreateSensitiveInterceptorOptions) {
  const keywords = (options?.keywords ?? DEFAULT_KEYWORDS).map((item) => item.toLowerCase());
  const regexes = options?.regexes ?? DEFAULT_REGEXES;
  const entropyThreshold = options?.entropyThreshold ?? 3.5;
  const tokenMinLength = options?.tokenMinLength ?? 18;

  return {
    inspect(text: string): SensitiveInspection {
      const lowered = text.toLowerCase();
      const words = toNormalizedWords(text);
      const reasons: string[] = [];

      for (const keyword of keywords) {
        if (keyword.includes(" ")) {
          if (lowered.includes(keyword)) {
            reasons.push(`keyword:${keyword}`);
          }
          continue;
        }
        if (words.includes(keyword)) {
          reasons.push(`keyword:${keyword}`);
        }
      }

      for (const pattern of regexes) {
        if (pattern.test(text)) {
          reasons.push(`regex:${pattern.source}`);
        }
      }

      const entropyTokens = findHighEntropyTokens(text, {
        threshold: entropyThreshold,
        tokenMinLength,
      });
      for (const token of entropyTokens) {
        reasons.push(`entropy:${token.slice(0, 6)}…`);
      }

      return {
        intercepted: reasons.length > 0,
        reasons,
      };
    },
  };
}
