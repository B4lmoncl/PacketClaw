import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComboMeter } from '../ComboMeter';

describe('ComboMeter', () => {
  it('bleibt unter 3 richtigen unsichtbar — kein Rauschen fuer nichts', () => {
    const { container } = render(<ComboMeter streak={2} />);
    expect(container.textContent).toBe('');
  });

  it('zeigt ab 3 den Multiplikator und die Serie', () => {
    render(<ComboMeter streak={3} />);
    expect(screen.getByText('×1.25')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hoehere Stufen zeigen hoehere Multiplikatoren', () => {
    const { rerender } = render(<ComboMeter streak={5} />);
    expect(screen.getByText('×1.5')).toBeInTheDocument();
    rerender(<ComboMeter streak={12} />);
    expect(screen.getByText('×2')).toBeInTheDocument();
  });
});
