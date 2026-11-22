// WizardConnect: pair a BCH wallet over the relay and use its first receive address as the claim destination.
import { initiateDappRelay } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { hash160, encodeCashAddress, CashAddressType } from '@bitauth/libauth';
import QRCode from 'qrcode';

const SESSION_KEY = 'proof-of-fold-wc';

export function initWizard(prefix: string, input: HTMLInputElement) {
  const btn = document.getElementById('wc-connect') as HTMLButtonElement;
  const status = document.getElementById('wc-status') as HTMLElement;
  const dlg = document.getElementById('wc-dialog') as HTMLDialogElement;
  const qr = document.getElementById('wc-qr') as HTMLImageElement;
  const link = document.getElementById('wc-link') as HTMLAnchorElement;
  let mgr: DappConnectionManager | undefined;
  let relay: ReturnType<typeof initiateDappRelay> | undefined;

  const stop = () => { mgr?.clearStoredSession(); void mgr?.destroy(); relay?.cleanup(); mgr = undefined; relay = undefined; };
  const useAddress = (m: DappConnectionManager) => {
    const pub = m.getPubkey(0, 0n);
    if (!pub) return;
    const { address } = encodeCashAddress({ prefix, type: CashAddressType.p2pkhWithTokens, payload: hash160(pub) });
    input.value = address;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    status.textContent = `Connected to ${m.walletName || 'your wallet'}. Claiming to its first receive address.`;
    btn.textContent = 'Disconnect wallet';
    btn.dataset.on = '1';
    if (dlg.open) dlg.close();
  };

  const connect = () => {
    mgr = new DappConnectionManager('Proof of Fold', undefined, { session: { key: SESSION_KEY } });
    mgr.on('walletready', () => useAddress(mgr!));
    mgr.on('disconnect', () => { stop(); btn.textContent = 'Connect with WizardConnect'; delete btn.dataset.on; status.textContent = 'Wallet disconnected.'; });
    relay = initiateDappRelay((p) => mgr!.updateConnection(p.client, p.status), {});
    mgr.attachRelay(relay);
    link.href = relay.uri;
    QRCode.toDataURL(relay.qrUri, { margin: 1, width: 260, errorCorrectionLevel: 'M' }).then((u: string) => { qr.src = u; });
    dlg.showModal();
  };

  btn.addEventListener('click', async () => {
    if (btn.dataset.on) { await mgr?.sendDisconnect().catch(() => {}); stop(); btn.textContent = 'Connect with WizardConnect'; delete btn.dataset.on; status.textContent = ''; return; }
    connect();
  });
  document.getElementById('wc-close')!.addEventListener('click', () => { dlg.close(); if (!btn.dataset.on) stop(); });
}
