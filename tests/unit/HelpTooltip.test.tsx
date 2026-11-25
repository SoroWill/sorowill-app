import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpTooltip } from '../../src/components/HelpTooltip';

function renderTip() {
  return render(
    <div>
      <HelpTooltip label="Grace period" text="Extra time before release." docsHref="/faq#lifecycle" />
      <button type="button">outside</button>
    </div>,
  );
}

describe('HelpTooltip (#884)', () => {
  it('is hidden until hovered, and is described by the tooltip', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Help: Grace period' });
    const tooltip = document.getElementById(button.getAttribute('aria-describedby')!)!;
    expect(tooltip).toHaveAttribute('role', 'tooltip');
    expect(tooltip).not.toBeVisible();

    fireEvent.mouseEnter(button.parentElement!);
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent('Extra time before release.');
    fireEvent.mouseLeave(button.parentElement!);
    expect(tooltip).not.toBeVisible();
  });

  it('opens on keyboard focus and closes on Escape', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Help: Grace period' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip', { hidden: true })).toBeVisible();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('toggles on tap for touch screens and closes on a tap outside', () => {
    renderTip();
    const button = screen.getByRole('button', { name: 'Help: Grace period' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('links to the docs', () => {
    renderTip();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Grace period' }));
    expect(screen.getByRole('link', { name: 'Learn more', hidden: true })).toHaveAttribute('href', '/faq#lifecycle');
  });
});
