import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabs } from '../hooks/useTabs';
import { DialogProvider } from '../DialogContext';
import { I18nProvider } from '../I18nContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(I18nProvider, null, React.createElement(DialogProvider, null, children));

describe('useTabs slot allocation', () => {
  it('allocates terminal into targeted slot when specified', async () => {
    const { result } = renderHook(() => useTabs('/test/path'), { wrapper });

    // Switch to 2x2 layout (4 slots)
    act(() => {
      result.current.setLayoutMode('2x2');
    });

    // Add initial terminal at slot 0
    act(() => {
      result.current.handleAddRawTerminal(true);
    });

    const firstTermId = result.current.terminals[0].id;
    expect(result.current.terminalSlots).toEqual([firstTermId, null, null, null]);

    // Add terminal targeting slot 2 (clicked empty slot 2)
    act(() => {
      result.current.handleAddRawTerminal(true, undefined, 2);
    });

    const secondTermId = result.current.terminals[1].id;
    expect(result.current.terminalSlots).toEqual([firstTermId, null, secondTermId, null]);

    // Add terminal without targetSlotIndex (e.g. via Ctrl+N) -> fills first empty slot (slot 1)
    act(() => {
      result.current.handleAddRawTerminal(true);
    });

    const thirdTermId = result.current.terminals.find(t => t.id !== firstTermId && t.id !== secondTermId)!.id;
    expect(result.current.terminalSlots).toEqual([firstTermId, thirdTermId, secondTermId, null]);

    // Close terminal at slot 0 -> slot 0 becomes null, other slots unaffected
    await act(async () => {
      await result.current.handleCloseTerminal(firstTermId);
    });

    expect(result.current.terminalSlots).toEqual([null, thirdTermId, secondTermId, null]);

    // Next Ctrl+N fills first empty slot (slot 0)
    act(() => {
      result.current.handleAddRawTerminal(true);
    });

    const fourthTermId = result.current.terminals[0].id;
    expect(result.current.terminalSlots).toEqual([fourthTermId, thirdTermId, secondTermId, null]);
  });

  it('keeps tabs order aligned with slots when creating right slot then left slot in dual split', () => {
    const { result } = renderHook(() => useTabs('/test/path'), { wrapper });

    // Switch to 2x1 layout (2 slots)
    act(() => {
      result.current.setLayoutMode('2x1');
    });

    // Create terminal in right slot first (targetSlotIndex = 1)
    act(() => {
      result.current.handleAddRawTerminal(true, 'opencode', 1);
    });

    const opencodeId = result.current.terminals[0].id;
    expect(result.current.terminalSlots).toEqual([null, opencodeId]);
    expect(result.current.tabs.filter(t => t.type === 'terminal').map(t => t.id)).toEqual([opencodeId]);

    // Create terminal in left slot next (targetSlotIndex = 0)
    act(() => {
      result.current.handleAddRawTerminal(true, 'shell', 0);
    });

    const shellId = result.current.terminalSlots[0];
    expect(result.current.terminalSlots).toEqual([shellId, opencodeId]);
    // Top tab bar order (tabs) must match grid slot order: [shell, opencode]
    expect(result.current.tabs.filter(t => t.type === 'terminal').map(t => t.id)).toEqual([shellId, opencodeId]);
  });
});
