process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet'
process.env.NEXT_PUBLIC_CONTRACT_ID = `C${'A'.repeat(55)}`

const GUARDIAN = 'GGUARDIANADDRESS'

jest.mock('@sorowill/sdk', () => ({
  SoroWillClient: jest.fn().mockImplementation(() => ({
    getWill: (willId: string) => {
      const id = Number(willId)
      if (id === 35) {
        return Promise.resolve({
          id: willId,
          guardians: [GUARDIAN],
        })
      }
      if (id <= 40) {
        return Promise.resolve({ id: willId, guardians: [] })
      }
      return Promise.reject(new Error('will not found'))
    },
  })),
}))

describe('getWillsByGuardian (Issue #172)', () => {
  it('finds a will with an ID beyond the old hardcoded 1-30 scan range', async () => {
    const { getWillsByGuardian } = await import('@/lib/sorowill')
    const result = await getWillsByGuardian(GUARDIAN)

    expect(result.wills.map((w) => w.id)).toContain('35')
    expect(result.hasErrors).toBe(false)
  })
})
