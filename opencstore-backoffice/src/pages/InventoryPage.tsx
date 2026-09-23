import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { fmtMoney } from '../lib/currency';
import {
  InventoryService,
  type Vendor,
  type Delivery,
  type DeliveryLine,
  type OnHandRow,
  type InventoryValuation,
} from '../modules/inventory/inventory.service';
import { ADJUSTMENT_REASON_CODES, type AdjustmentReasonCode } from '../modules/inventory/inventory-rules';

type Tab = 'onhand' | 'deliveries' | 'vendors';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('onhand');

  return (
    <>
      <PageHeader title="Inventory" subtitle="On-hand levels, receiving, and vendors" />

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['onhand', 'deliveries', 'vendors'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'onhand' ? 'On-Hand' : t === 'deliveries' ? 'Deliveries' : 'Vendors'}
          </button>
        ))}
      </div>

      {tab === 'onhand' && <OnHandTab />}
      {tab === 'deliveries' && <DeliveriesTab />}
      {tab === 'vendors' && <VendorsTab />}
    </>
  );
}

// ─── On-Hand ────────────────────────────────────────────────────────────────

function OnHandTab() {
  const [rows, setRows] = useState<OnHandRow[] | null>(null);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState<OnHandRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([InventoryService.getOnHandLevels(), InventoryService.getValuation()]);
      setRows(r);
      setValuation(v);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="animate-pulse space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title="No items yet" description="Import a pricebook first, then on-hand levels will show up here." icon="▦" />;
  }

  return (
    <>
      {valuation && (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="card">
            <p className="text-xs text-gray-500">Total Inventory Value</p>
            <p className="text-xl font-bold text-gray-900">{fmtMoney(valuation.totalValue)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500">Active Items</p>
            <p className="text-xl font-bold text-gray-900">{valuation.itemCount}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500">Low Stock</p>
            <p className={`text-xl font-bold ${valuation.lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {valuation.lowStockCount}
            </p>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="table-base w-full text-xs">
          <thead>
            <tr>
              <th className="text-left">PLU</th>
              <th className="text-left">Description</th>
              <th className="text-left">Dept</th>
              <th className="text-right">On Hand</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Ext. Value</th>
              <th></th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.plu_item_id}>
                <td className="font-mono">{r.pos_plu_id}</td>
                <td className="max-w-[200px] truncate">{r.description}</td>
                <td className="text-gray-500">{r.dept_name ?? '—'}</td>
                <td className="text-right tabular-nums">{r.on_hand_qty}</td>
                <td className="text-right tabular-nums">{fmtMoney(r.cost ?? undefined)}</td>
                <td className="text-right tabular-nums">{fmtMoney(r.extended_value)}</td>
                <td>{r.low_stock && <StatusBadge label="Low Stock" variant="red" />}</td>
                <td className="text-right">
                  <button className="text-blue-600 hover:underline" onClick={() => setAdjusting(r)}>
                    Adjust
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adjusting && (
        <AdjustDialog
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); load(); }}
        />
      )}
    </>
  );
}

function AdjustDialog({ item, onClose, onSaved }: { item: OnHandRow; onClose: () => void; onSaved: () => void }) {
  const [qtyDelta, setQtyDelta] = useState('');
  const [reason, setReason] = useState<AdjustmentReasonCode>('physical_count');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const delta = Number(qtyDelta);
    if (!delta) { setError('Enter a non-zero quantity (negative for shrink/waste).'); return; }
    setSaving(true);
    setError(null);
    try {
      await InventoryService.createAdjustment(item.plu_item_id, delta, reason, notes || undefined);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Adjust: {item.description}</h2>
        <p className="text-xs text-gray-500">Current on hand: {item.on_hand_qty}</p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity Change</label>
          <input
            type="number" step="any" className="input w-full" placeholder="e.g. -2 for shrink, 5 for found stock"
            value={qtyDelta} onChange={e => setQtyDelta(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
          <select className="input w-full" value={reason} onChange={e => setReason(e.target.value as AdjustmentReasonCode)}>
            {ADJUSTMENT_REASON_CODES.map(code => (
              <option key={code} value={code}>{code.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
          <input type="text" className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Deliveries ─────────────────────────────────────────────────────────────

function DeliveriesTab() {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [confirmReceive, setConfirmReceive] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([InventoryService.listDeliveries(), InventoryService.listVendors()]);
      setDeliveries(d);
      setVendors(v);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function doReceive(id: string) {
    setConfirmReceive(null);
    await InventoryService.receiveDelivery(id);
    await load();
  }

  if (loading) {
    return <div className="animate-pulse space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  return (
    <>
      <div className="mb-4">
        {creating ? (
          <NewDeliveryForm
            vendors={vendors}
            onCancel={() => setCreating(false)}
            onCreated={id => { setCreating(false); setOpenDeliveryId(id); load(); }}
          />
        ) : (
          <button className="btn-primary" onClick={() => setCreating(true)} disabled={vendors.length === 0}>
            New Delivery
          </button>
        )}
        {vendors.length === 0 && !creating && (
          <p className="text-xs text-gray-400 mt-1">Add a vendor first, on the Vendors tab.</p>
        )}
      </div>

      {!deliveries || deliveries.length === 0 ? (
        <EmptyState title="No deliveries yet" description="Deliveries you create will show up here." icon="↑" />
      ) : (
        <div className="space-y-2">
          {deliveries.map(d => (
            <div key={d.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {d.vendor_name} {d.invoice_number ? `— #${d.invoice_number}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.line_count ?? 0} line item(s) · {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge label={d.status} status={d.status === 'received' ? 'approved' : d.status === 'draft' ? 'pending' : 'rejected'} />
                  <button className="text-xs text-blue-600 hover:underline" onClick={() => setOpenDeliveryId(openDeliveryId === d.id ? null : d.id)}>
                    {openDeliveryId === d.id ? 'Hide' : 'View'}
                  </button>
                </div>
              </div>

              {openDeliveryId === d.id && (
                <DeliveryDetail
                  deliveryId={d.id}
                  editable={d.status === 'draft'}
                  onReceive={() => setConfirmReceive(d.id)}
                  onLineAdded={load}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmReceive !== null}
        title="Receive this delivery?"
        message="This adds each line's quantity to on-hand stock and updates item cost. This cannot be undone from here."
        variant="info"
        confirmLabel="Receive"
        onConfirm={() => confirmReceive && doReceive(confirmReceive)}
        onCancel={() => setConfirmReceive(null)}
      />
    </>
  );
}

function NewDeliveryForm({ vendors, onCancel, onCreated }: { vendors: Vendor[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!vendorId) { setError('Choose a vendor.'); return; }
    setSaving(true);
    setError(null);
    try {
      const id = await InventoryService.createDelivery(vendorId, invoiceNumber || undefined, notes || undefined);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-3 max-w-md">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Vendor</label>
        <select className="input w-full" value={vendorId} onChange={e => setVendorId(e.target.value)}>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Invoice # (optional)</label>
        <input type="text" className="input w-full" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
        <input type="text" className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={create}>
          {saving ? 'Creating…' : 'Create Draft'}
        </button>
        <button className="text-sm text-gray-500" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DeliveryDetail({ deliveryId, editable, onReceive, onLineAdded }: {
  deliveryId: string; editable: boolean; onReceive: () => void; onLineAdded: () => void;
}) {
  const [lines, setLines] = useState<DeliveryLine[] | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; pos_plu_id: string; description: string }[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function loadLines() {
    const detail = await InventoryService.getDelivery(deliveryId);
    setLines(detail?.lines ?? []);
  }

  useEffect(() => { loadLines(); }, [deliveryId]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await window.electronAPI.getItems({ search, limit: 8 });
      setResults(res.items);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function addLine() {
    if (!selectedItemId) { setError('Pick an item.'); return; }
    const q = Number(qty), c = Number(unitCost);
    if (!(q > 0)) { setError('Quantity must be greater than zero.'); return; }
    if (!(c >= 0)) { setError('Unit cost cannot be negative.'); return; }
    setError(null);
    try {
      await InventoryService.addDeliveryLine(deliveryId, { pluItemId: selectedItemId, qty: q, unitCost: c });
      setSelectedItemId(''); setSearch(''); setQty(''); setUnitCost('');
      await loadLines();
      onLineAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {lines === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">No line items yet.</p>
      ) : (
        <table className="table-base w-full text-xs mb-3">
          <thead>
            <tr>
              <th className="text-left">PLU</th>
              <th className="text-left">Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td className="font-mono">{l.pos_plu_id}</td>
                <td>{l.description}</td>
                <td className="text-right tabular-nums">{l.qty}</td>
                <td className="text-right tabular-nums">{fmtMoney(l.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text" className="input w-full" placeholder="Search item by description or PLU…"
              value={selectedItemId ? results.find(r => r.id === selectedItemId)?.description ?? search : search}
              onChange={e => { setSearch(e.target.value); setSelectedItemId(''); }}
            />
            {results.length > 0 && !selectedItemId && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-40 overflow-y-auto">
                {results.map(r => (
                  <button
                    key={r.id} type="button"
                    className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                    onClick={() => { setSelectedItemId(r.id); setResults([]); }}
                  >
                    {r.pos_plu_id} — {r.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input type="number" step="any" placeholder="Qty" className="input w-24" value={qty} onChange={e => setQty(e.target.value)} />
            <input type="number" step="any" placeholder="Unit cost" className="input w-28" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            <button className="btn-secondary text-xs" onClick={addLine}>Add Line</button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}

          {lines && lines.length > 0 && (
            <button className="btn-primary text-xs mt-2" onClick={onReceive}>Receive Delivery</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Vendors ────────────────────────────────────────────────────────────────

function VendorsTab() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setVendors(await InventoryService.listVendors());
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!name.trim()) { setError('Vendor name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await InventoryService.createVendor({ name, contactName: contactName || undefined, phone: phone || undefined, email: email || undefined });
      setName(''); setContactName(''); setPhone(''); setEmail('');
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!vendors) {
    return <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  return (
    <>
      <div className="mb-4">
        {adding ? (
          <div className="card space-y-3 max-w-md">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Name</label>
              <input type="text" className="input w-full" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Contact Name</label>
              <input type="text" className="input w-full" value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" className="input w-full" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="text" className="input w-full" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Add Vendor'}
              </button>
              <button className="text-sm text-gray-500" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setAdding(true)}>Add Vendor</button>
        )}
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendors yet" description="Add a vendor to start receiving deliveries." icon="↑" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table-base w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Name</th>
                <th className="text-left">Contact</th>
                <th className="text-left">Phone</th>
                <th className="text-left">Email</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td className="text-gray-500">{v.contact_name ?? '—'}</td>
                  <td className="text-gray-500">{v.phone ?? '—'}</td>
                  <td className="text-gray-500">{v.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
