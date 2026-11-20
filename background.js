const chromeMajorVersion = 157 + Math.floor((Date.now() - Date.UTC(2026, 10, 19)) / (28 * 24 * 60 * 60 * 1000));

function chromePlatform(firefoxUserAgent) {
  if (firefoxUserAgent.includes('Windows')) return { userAgentToken: 'Windows NT 10.0; Win64; x64', clientHint: '"Windows"' };
  if (firefoxUserAgent.includes('Macintosh')) return { userAgentToken: 'Macintosh; Intel Mac OS X 10_15_7', clientHint: '"macOS"' };
  return { userAgentToken: 'X11; Linux x86_64', clientHint: '"Linux"' };
}

function isMeetRequest(details) {
  if (new URL(details.url).hostname === 'meet.google.com') return true;
  return (details.originUrl ?? '').startsWith('https://meet.google.com/');
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!isMeetRequest(details)) return {};

    const userAgentHeader = details.requestHeaders.find((header) => header.name.toLowerCase() === 'user-agent');
    const platform = chromePlatform(userAgentHeader.value);
    const clientHintHeaders = [
      { name: 'Sec-CH-UA', value: `"Chromium";v="${chromeMajorVersion}", "Google Chrome";v="${chromeMajorVersion}", "Not_A Brand";v="99"` },
      { name: 'Sec-CH-UA-Mobile', value: '?0' },
      { name: 'Sec-CH-UA-Platform', value: platform.clientHint },
    ];

    userAgentHeader.value = `Mozilla/5.0 (${platform.userAgentToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajorVersion}.0.0.0 Safari/537.36`;
    const requestHeaders = details.requestHeaders.filter((header) => !header.name.toLowerCase().startsWith('sec-ch-ua'));
    return { requestHeaders: [...requestHeaders, ...clientHintHeaders] };
  },
  { urls: ['*://meet.google.com/*', '*://*.clients6.google.com/*'] },
  ['blocking', 'requestHeaders'],
);
