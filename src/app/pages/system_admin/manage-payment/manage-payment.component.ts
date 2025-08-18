import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, where, doc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { Modal } from 'bootstrap';

type PaymentRecord = {
  id: string;
  carOwnerId?: string;
  carOwnerName?: string;
  serviceCenterId?: string;
  serviceCenterName?: string;
  amount?: number;
  status?: string; // 'on-hold' | 'confirmed' | 'released' | 'rejected'
  proofUrl?: string;
  createdAt?: any; // Firestore Timestamp
  holdExtendedUntil?: any; // optional Timestamp
  // derived fields:
  createdAtDate?: Date;
  daysElapsed?: number;
  daysLeft?: number;
};

@Component({
  selector: 'app-manage-payment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-payment.component.html',
  styleUrls: ['./manage-payment.component.css']
})
export class ManagePaymentComponent implements OnDestroy {
  private firestore = inject(Firestore);

  // Live subscription holder
  private sub: Subscription | null = null;

  // Local derived payments array for template rendering
  payments: PaymentRecord[] = [];

  // Modal preview state
  previewUrl = '';
  previewModal?: Modal | null;

  // Constants
  readonly AUTO_CONFIRM_DAYS = 7;

  constructor() {
    // Query for on-hold payments
    const paymentsRef = collection(this.firestore, 'payments');
    const q = query(paymentsRef, where('status', '==', 'on-hold'));

    // Live stream and convert to derived records
    this.sub = collectionData(q, { idField: 'id' }).subscribe((data: any[]) => {
      const now = new Date();
      this.payments = data.map(p => {
        const record: PaymentRecord = {
          id: p.id,
          carOwnerId: p.carOwnerId,
          carOwnerName: p.carOwnerName || p.carOwnerName || '—',
          serviceCenterId: p.serviceCenterId,
          serviceCenterName: p.serviceCenterName || '—',
          amount: p.amount,
          status: p.status,
          proofUrl: p.proofUrl,
          createdAt: p.createdAt,
          holdExtendedUntil: p.holdExtendedUntil,
          daysLeft: p.daysLeft ?? 0,
        };

        // derive createdAtDate and daysElapsed/daysLeft
        const createdAt = p.createdAt ? new Date(p.createdAt.seconds * 1000) : new Date();
        record.createdAtDate = createdAt;

        // if extended until exists, compute daysLeft relative to that
        const target = p.holdExtendedUntil ? new Date(p.holdExtendedUntil.seconds * 1000) : new Date(createdAt.getTime() + this.AUTO_CONFIRM_DAYS * 24 * 3600 * 1000);
        const msLeft = target.getTime() - now.getTime();
        record.daysElapsed = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        record.daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

        return record;
      });

      // perform client-side auto-confirm for expired items
      this.autoConfirmExpired();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.previewModal?.hide();
  }

  // open proof preview (Bootstrap modal)
  openPreview(url: string) {
    this.previewUrl = url || '';
    const el = document.getElementById('proofPreviewModal');
    if (!el) return console.error('Modal element not found');
    this.previewModal = new Modal(el, { backdrop: true });
    this.previewModal.show();
  }

  // Manual actions
  async confirmPayment(payment: PaymentRecord) {
    try {
      const ref = doc(this.firestore, 'payments', payment.id);
      await updateDoc(ref, {
        status: 'confirmed',
        confirmedAt: Timestamp.now()
      });
      alert(`Payment ${payment.id} confirmed.`);
    } catch (err) {
      console.error(err);
      alert('Failed to confirm payment.');
    }
  }

  async releasePayment(payment: PaymentRecord) {
    try {
      const ref = doc(this.firestore, 'payments', payment.id);
      await updateDoc(ref, {
        status: 'released',
        releasedAt: Timestamp.now()
      });
      alert(`Payment ${payment.id} released to service center.`);
    } catch (err) {
      console.error(err);
      alert('Failed to release payment.');
    }
  }

  async rejectPayment(payment: PaymentRecord, reason = 'Rejected by admin') {
    try {
      const ref = doc(this.firestore, 'payments', payment.id);
      await updateDoc(ref, {
        status: 'rejected',
        rejectedAt: Timestamp.now(),
        rejectionReason: reason
      });
      alert(`Payment ${payment.id} rejected.`);
    } catch (err) {
      console.error(err);
      alert('Failed to reject payment.');
    }
  }

  // Extend the hold by X days (administrator choice)
  async extendHold(payment: PaymentRecord, extraDays = 3) {
    try {
      const ref = doc(this.firestore, 'payments', payment.id);
      const currentTarget = payment.holdExtendedUntil ? new Date(payment.holdExtendedUntil.seconds * 1000) : new Date(payment.createdAtDate!.getTime() + this.AUTO_CONFIRM_DAYS * 24 * 3600 * 1000);
      const newTarget = new Date(currentTarget.getTime() + extraDays * 24 * 3600 * 1000);
      await updateDoc(ref, {
        holdExtendedUntil: Timestamp.fromDate(newTarget)
      });
      alert(`Hold extended by ${extraDays} days (until ${newTarget.toDateString()}).`);
    } catch (err) {
      console.error(err);
      alert('Failed to extend hold.');
    }
  }

  // Client-side auto-confirm: find payments with daysLeft <= 0 and auto-confirm
  private async autoConfirmExpired() {
    const now = new Date();
    for (const p of this.payments) {
      // consider only on-hold items (we subscribed on that basis already)
      if ((p.daysLeft ?? 0) <= 0) {
        // before auto-confirming, you might want to check if proof exists and owner hasn't disputed
        // For demo: auto-confirm (but in prod move this to Cloud Function)
        try {
          const ref = doc(this.firestore, 'payments', p.id);
          await updateDoc(ref, {
            status: 'confirmed',
            autoConfirmedAt: Timestamp.now(),
            autoConfirmedBy: 'system' // indicate automatic action
          });
          console.info(`Auto-confirmed payment ${p.id}`);
        } catch (err) {
          console.error('Auto-confirm failed for', p.id, err);
        }
      }
    }
  }
}
