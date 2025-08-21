import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, limit } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class ServiceCenterContextService {
  private firestore = inject(Firestore);
  private _serviceCenterId: string | null = null;

  async resolveServiceCenterIdByEmail(email: string): Promise<string | null> {
    if (this._serviceCenterId) return this._serviceCenterId;
    const q = query(
      collection(this.firestore, 'repair_service_centers'),
      where('adminInfo.email', '==', email), limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    this._serviceCenterId = snap.docs[0].id;
    return this._serviceCenterId;
  }

  get serviceCenterId() { return this._serviceCenterId; }
  clear() { this._serviceCenterId = null; }
}
