import WebSocket from 'ws';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.nostr.band'
];

export async function fetchNostrMetadata(pubkey, timeoutMs = 10000) {
  for (const relayUrl of RELAYS) {
    try {
      console.log(`Trying relay: ${relayUrl}`);
      const metadata = await tryFetchFromRelay(relayUrl, pubkey, timeoutMs / RELAYS.length);
      if (metadata) return metadata;
    } catch (error) {
      console.log(`Relay ${relayUrl} failed: ${error.message}`);
    }
  }
  
  return null;
}

function tryFetchFromRelay(relayUrl, pubkey, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relayUrl);
    let metadataReceived = false;
    
    const timeout = setTimeout(() => {
      if (!metadataReceived) {
        ws.close();
        reject(new Error('Metadata fetch timeout'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      const subscriptionId = `metadata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const req = JSON.stringify([
        "REQ",
        subscriptionId,
        { kinds: [0], authors: [pubkey], limit: 1 }
      ]);
      console.log(`Sending request to ${relayUrl}: ${req}`);
      ws.send(req);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const [type, , eventData] = data;
        
        console.log(`Received from ${relayUrl}: ${event.data}`);
        
        if (type === 'EVENT' && eventData && eventData.kind === 0) {
          metadataReceived = true;
          clearTimeout(timeout);
          ws.close();
          
          const parsedMetadata = JSON.parse(eventData.content);
          resolve(parsedMetadata);
          
        } else if (type === 'EOSE') {
          if (!metadataReceived) {
            clearTimeout(timeout);
            ws.close();
            reject(new Error('No metadata found on this relay'));
          }
        }
      } catch (parseError) {
        console.log(`Parse error from ${relayUrl}: ${parseError.message}`);
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message || 'Connection failed'}`));
    };

    ws.onclose = (event) => {
      if (!metadataReceived && event.code !== 1000) {
        clearTimeout(timeout);
        reject(new Error(`WebSocket closed unexpectedly: ${event.code}`));
      }
    };
  });
}