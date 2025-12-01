interface NostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

interface SignedNostrEvent extends NostrEvent {
  id: string;
  sig: string;
}

interface Window {
  nostr?: {
    getPublicKey(): Promise<string>;
    signEvent(event: NostrEvent): Promise<SignedNostrEvent>;
  };
}