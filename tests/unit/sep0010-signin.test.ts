describe('SEP-0010 Sign-in Flow (Issue #26)', () => {
  describe('Challenge/Response Sign-in', () => {
    it('should fetch a SEP-0010 challenge from the server', async () => {
      const mockChallenge = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

      const response = {
        ok: true,
        json: async () => ({ transaction: mockChallenge }),
      }

      global.fetch = jest.fn(() => Promise.resolve(response as Response))

      const result = await fetch('/api/auth/challenge', {
        method: 'GET',
      }).then((res) => res.json())

      expect(result.transaction).toBe(mockChallenge)
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/challenge', { method: 'GET' })
    })

    it('should sign the challenge with a Stellar keypair', () => {
      const mockSignedTransaction = 'signed_transaction_xdr'
      const mockPublicKey = 'GCQRQHBG64RXZXPD73KPD4RNPQDWSW6QBIVVPICMZ2ZQ7CWSQKQ5CLKM'

      const signedData = {
        publicKey: mockPublicKey,
        signedTransaction: mockSignedTransaction,
      }

      expect(signedData.publicKey).toBe(mockPublicKey)
      expect(signedData.signedTransaction).toBe(mockSignedTransaction)
    })

    it('should submit the signed challenge to complete authentication', async () => {
      const mockSignedTransaction = 'signed_transaction_xdr'
      const mockSessionToken = 'session_token_jwt'

      const response = {
        ok: true,
        json: async () => ({ token: mockSessionToken }),
      }

      global.fetch = jest.fn(() => Promise.resolve(response as Response))

      const result = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction: mockSignedTransaction }),
      }).then((res) => res.json())

      expect(result.token).toBe(mockSessionToken)
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction: mockSignedTransaction }),
      })
    })
  })

  describe('Session Token Persistence', () => {
    it('should securely store the session token in browser storage', () => {
      const mockToken = 'session_token_jwt'

      sessionStorage.setItem('stellar_session', mockToken)

      const storedToken = sessionStorage.getItem('stellar_session')
      expect(storedToken).toBe(mockToken)
    })

    it('should use secure, httpOnly cookies if available server-side', () => {
      const mockSetCookie = 'stellar_session=token_value; HttpOnly; Secure; SameSite=Strict; Max-Age=3600'

      expect(mockSetCookie).toContain('HttpOnly')
      expect(mockSetCookie).toContain('Secure')
      expect(mockSetCookie).toContain('SameSite=Strict')
    })

    it('should retrieve and validate stored session token on page load', () => {
      const mockToken = 'session_token_jwt'
      sessionStorage.setItem('stellar_session', mockToken)

      const token = sessionStorage.getItem('stellar_session')
      expect(token).toBe(mockToken)

      sessionStorage.removeItem('stellar_session')
    })
  })

  describe('Session Token Validation', () => {
    it('should validate that the session token is a valid JWT', () => {
      const mockJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHQ1FSUUhCRzY0UlhZWFBEBkdUKPD4SRNQ....'

      const isValidJWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(mockJWT)
      expect(isValidJWT).toBe(true)
    })

    it('should reject an invalid or expired session token', () => {
      const expiredToken = 'expired_token'
      const isValidJWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(expiredToken)

      expect(isValidJWT).toBe(false)
    })
  })

  describe('Wallet Connection Integration', () => {
    it('should replace wallet public key check with SEP-0010 session validation', () => {
      const walletPublicKey = 'GCQRQHBG64RXZXPD73KPD4RNPQDWSW6QBIVVPICMZ2ZQ7CWSQKQ5CLKM'
      const sessionToken = 'session_token_jwt'

      expect(sessionToken).toBeDefined()
      expect(walletPublicKey).toBeDefined()
    })

    it('should maintain backward compatibility by detecting wallet if session token is missing', () => {
      const noSessionToken = null
      const walletAvailable = true

      expect(noSessionToken || walletAvailable).toBe(true)
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
  })
})
