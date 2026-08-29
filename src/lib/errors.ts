/**
 * Shared check for whether an error message indicates the will does not
 * exist on chain (contract-level "will not found" / "WillNotFound", error
 * code #1). Used by every call site that needs to classify a "will not
 * found" condition so they stay consistent with one another.
 */
export function isWillNotFoundMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('not found') ||
    msg.includes('willnotfound') ||
    msg.includes('no such will') ||
    msg.includes('does not exist') ||
    msg.includes('error(contract, #1)')
  );
}

export function isWillNotFoundError(error: unknown): boolean {
  return error instanceof Error && isWillNotFoundMessage(error.message);
}

const KNOWN_ERROR_PATTERNS: ReadonlyArray<{
  test: (message: string) => boolean;
  friendly: string;
}> = [
  {
    test: (message) =>
      message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch'),
    friendly:
      'Unable to reach the blockchain network. Please check your connection and try again.',
  },
  {
    test: (message) =>
      message.toLowerCase().includes('contract') &&
      message.toLowerCase().includes('not found'),
    friendly: 'The smart contract could not be found on the network.',
  },
  {
    test: (message) => isWillNotFoundMessage(message),
    friendly: 'This will was not found on the blockchain.',
  },
  {
    test: (message) => message.toLowerCase().includes('simulation'),
    friendly:
      'The transaction simulation failed. The will may no longer be in a state that allows this action.',
  },
  {
    test: (message) =>
      message.toLowerCase().includes('insufficient') ||
      message.toLowerCase().includes('balance'),
    friendly: 'There are not enough funds to complete this operation.',
  },
  {
    test: (message) => message.toLowerCase().includes('already voted'),
    friendly: "You've already cast a vote on this will.",
  },
  {
    test: (message) =>
      message.toLowerCase().includes('not a guardian') ||
      message.toLowerCase().includes('not guardian'),
    friendly:
      'You are not eligible to perform this action on this will.',
  },
  {
    test: (message) => message.toLowerCase().includes('unauthorized'),
    friendly:
      'You do not have permission to perform this action.',
  },
];

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    for (const pattern of KNOWN_ERROR_PATTERNS) {
      if (pattern.test(error.message)) {
        return pattern.friendly;
      }
    }
  }
  return 'Something went wrong. Please try again later.';
}
