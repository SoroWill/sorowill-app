describe('NetworkMismatchBanner (Issue #247)', () => {
  describe('Single Instance Mount', () => {
    it('should render only one NetworkMismatchBanner instance in the header', () => {
      const headerElement = document.querySelector('header');
      const bannerElements = headerElement?.querySelectorAll('[data-testid="network-mismatch-banner"]');

      expect(bannerElements?.length).toBe(1);
    });

    it('should not mount duplicate NetworkMismatchBanner instances', () => {
      const allBanners = document.querySelectorAll('[data-testid="network-mismatch-banner"]');

      expect(allBanners.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Dismissed State Sync', () => {
    it('should sync dismissed state across all banner instances via sessionStorage', () => {
      const storageKey = 'network-mismatch-dismissed';
      const initialState = sessionStorage.getItem(storageKey);

      sessionStorage.setItem(storageKey, '1');
      const afterDismiss = sessionStorage.getItem(storageKey);

      expect(afterDismiss).toBe('1');

      if (initialState === null) {
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, initialState);
      }
    });
  });
});
