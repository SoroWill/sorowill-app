import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import type { Beneficiary } from '@sorowill/sdk';
import { BeneficiaryForm } from './BeneficiaryForm';

const meta: Meta<typeof BeneficiaryForm> = {
  title: 'Components/BeneficiaryForm',
  component: BeneficiaryForm,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof BeneficiaryForm>;

const singleBeneficiary: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 100 },
];

const twoBeneficiaries: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 50 },
  { address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 50 },
];

const threeBeneficiaries: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 40 },
  { address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 35 },
  { address: 'GCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 25 },
];

const invalidTotal: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 40 },
  { address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 30 },
];

const allEmpty: Beneficiary[] = [
  { address: '', percentage: 0 },
];

export const Empty: Story = {
  args: {
    value: [],
    onChange: fn(),
  },
};

export const SingleBeneficiary: Story = {
  args: {
    value: singleBeneficiary,
    onChange: fn(),
  },
};

export const TwoBeneficiariesEqual: Story = {
  args: {
    value: twoBeneficiaries,
    onChange: fn(),
  },
};

export const ThreeBeneficiaries: Story = {
  args: {
    value: threeBeneficiaries,
    onChange: fn(),
  },
};

export const InvalidTotal: Story = {
  args: {
    value: invalidTotal,
    onChange: fn(),
  },
};

export const EmptyAddress: Story = {
  args: {
    value: allEmpty,
    onChange: fn(),
  },
};

const invalidAddress: Beneficiary[] = [{ address: 'not-an-address', percentage: 100 }];

const accountWhereContractNeeded: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 100 },
];

const federated: Beneficiary[] = [{ address: 'alice*example.com', percentage: 100 }];

const fractional: Beneficiary[] = [
  { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 33.5 },
  { address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 66.5 },
];

/** Error state: the address is not a Stellar address. */
export const InvalidAddress: Story = {
  args: { value: invalidAddress, onChange: fn() },
};

/** Error state: the token needs a contract address (C...) and this is an account (G...). */
export const AccountAddressWhereContractNeeded: Story = {
  args: { value: accountWhereContractNeeded, addressType: 'contract', onChange: fn() },
};

/** A federated address (name*domain) that still has to be resolved. */
export const FederatedAddress: Story = {
  args: { value: federated, onChange: fn() },
};

/** Error state: percentages that are not whole numbers. */
export const FractionalPercentages: Story = {
  args: { value: fractional, onChange: fn() },
};

/** Edge case: many rows. */
export const ManyBeneficiaries: Story = {
  args: {
    value: Array.from({ length: 10 }, (_, index) => ({
      address: `G${String.fromCharCode(65 + index)}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
      percentage: 10,
    })),
    onChange: fn(),
  },
};
