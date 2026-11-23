import { render, screen } from '@testing-library/react';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';

describe('BeneficiaryForm address error semantics (#328)', () => {
  it('marks an invalid address with aria-invalid and links the alert message', () => {
    render(<BeneficiaryForm value={[{ address: 'INVALID', percentage: 100 }]} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Beneficiary 1 Address');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Invalid Stellar address');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
  });

  it('leaves a valid address unmarked', () => {
    render(
      <BeneficiaryForm
        value={[{ address: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4', percentage: 100 }]}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Beneficiary 1 Address');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('BeneficiaryForm label associations (#672)', () => {
  it('associates each beneficiary address and percentage input with a label', () => {
    render(
      <BeneficiaryForm
        value={[
          { address: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4', percentage: 50 },
          { address: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4', percentage: 50 },
        ]}
        onChange={vi.fn()}
      />,
    );

    const addressInput1 = screen.getByLabelText('Beneficiary 1 Address');
    const percentageInput1 = screen.getByLabelText('Beneficiary 1 Percentage');
    const addressInput2 = screen.getByLabelText('Beneficiary 2 Address');
    const percentageInput2 = screen.getByLabelText('Beneficiary 2 Percentage');

    expect(addressInput1.tagName).toBe('INPUT');
    expect(percentageInput1.tagName).toBe('INPUT');
    expect(addressInput2.tagName).toBe('INPUT');
    expect(percentageInput2.tagName).toBe('INPUT');

    const addressLabel1 = screen.getByText('Beneficiary 1 Address');
    const percentageLabel1 = screen.getByText('Beneficiary 1 Percentage');
    const addressLabel2 = screen.getByText('Beneficiary 2 Address');
    const percentageLabel2 = screen.getByText('Beneficiary 2 Percentage');

    expect(addressLabel1.tagName).toBe('LABEL');
    expect(percentageLabel1.tagName).toBe('LABEL');
    expect(addressLabel2.tagName).toBe('LABEL');
    expect(percentageLabel2.tagName).toBe('LABEL');

    expect(addressLabel1).toHaveAttribute('for', addressInput1.id);
    expect(percentageLabel1).toHaveAttribute('for', percentageInput1.id);
    expect(addressLabel2).toHaveAttribute('for', addressInput2.id);
    expect(percentageLabel2).toHaveAttribute('for', percentageInput2.id);

    expect(addressInput1.id).toBeTruthy();
    expect(percentageInput1.id).toBeTruthy();
    expect(addressInput2.id).toBeTruthy();
    expect(percentageInput2.id).toBeTruthy();
  });
});