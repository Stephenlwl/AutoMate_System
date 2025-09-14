import { Injectable, inject } from '@angular/core';
import { Firestore, collection, query, where, getDocs, limit } from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class SystemAdminContextService {
  private firestore = inject(Firestore);
  private _systemAdminId: string | null = null;

  async resolveSystemAdminIdByEmail(email: string): Promise<string | null> {
    if (this._systemAdminId) return this._systemAdminId;
    const q = query(
      collection(this.firestore, 'system_admins'),
      where('email', '==', email), limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    this._systemAdminId = snap.docs[0].id;
    return this._systemAdminId;
  }

  get systemAdminId() { return this._systemAdminId; }
  clear() { this._systemAdminId = null; }
}
