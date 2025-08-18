import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, limit } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class ServiceCenterContextService {
  private firestore = inject(Firestore);
  private _workshopId: string | null = null;

  async resolveWorkshopIdByEmail(email: string): Promise<string | null> {
    if (this._workshopId) return this._workshopId;
    const q = query(
      collection(this.firestore, 'repair_service_centers'),
      where('adminInfo.email', '==', email), limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    this._workshopId = snap.docs[0].id;
    return this._workshopId;
  }

  get workshopId() { return this._workshopId; }
  clear() { this._workshopId = null; }
}
