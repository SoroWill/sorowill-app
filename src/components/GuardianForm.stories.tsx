import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { GuardianForm, type GuardianFormProps } from './GuardianForm';

const meta: Meta<typeof GuardianForm> = {
  title: 'Components/GuardianForm',
  component: GuardianForm,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GuardianForm>;

const ADDRESS_A = 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADDRESS_B = 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ADDRESS_C = 'GCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Props for a list of guardians with no validation state; stories override what they need. */
function make(guardians: string[], overrides: Partial<GuardianFormProps> = {}): GuardianFormProps {
  return {
    guardians,
    guardianIds: new Map(guardians.map((_, index) => [index, `guardian-${index}`])),
    resolvedGuardians: new Map(),
    guardianResolutionError: new Map(),
    resolvingGuardianId: null,
    rowErrors: guardians.map(() => ''),
    topError: null,
    blankGuardianIndices: [],
    onAdd: fn(),
    onRemove: fn(),
    onUpdate: fn(),
    onResolve: fn(),
    ...overrides,
  };
}

/** Empty state: guardians are optional, so a will can have none. */
export const Empty: Story = { args: make([]) };

/** Happy path: three valid guardians. */
export const ThreeGuardians: Story = { args: make([ADDRESS_A, ADDRESS_B, ADDRESS_C]) };

/** Error state: a row that is not a Stellar address. */
export const InvalidAddress: Story = {
  args: make(['not-an-address'], {
    rowErrors: ['Not a valid Stellar address (must start with G and be 56 characters)'],
  }),
};

/** Error state: the same address twice. */
export const DuplicateGuardian: Story = {
  args: make([ADDRESS_A, ADDRESS_A], { rowErrors: ['', 'Duplicate guardian address'] }),
};

/** Error state: a problem with the list as a whole. */
export const ListError: Story = {
  args: make([ADDRESS_A], { topError: 'Add at least 3 guardians, or remove them all.' }),
};

/** Edge case: blank rows, which are dropped on submit. */
export const BlankRows: Story = {
  args: make([ADDRESS_A, '', ''], { blankGuardianIndices: [1, 2] }),
};

/** Loading state: a federated address is being resolved. */
export const ResolvingFederatedAddress: Story = {
  args: make(['alice*example.com'], { resolvingGuardianId: 'guardian-0' }),
};

/** Resolution finished: the federated address was turned into a Stellar address. */
export const ResolvedFederatedAddress: Story = {
  args: make(['alice*example.com'], { resolvedGuardians: new Map([['guardian-0', ADDRESS_B]]) }),
};

/** Error state: the federated lookup failed. */
export const ResolutionFailed: Story = {
  args: make(['alice*example.com'], {
    guardianResolutionError: new Map([['guardian-0', 'Could not resolve alice*example.com']]),
  }),
};
