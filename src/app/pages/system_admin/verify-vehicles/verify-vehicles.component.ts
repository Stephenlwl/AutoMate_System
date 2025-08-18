// verify-vehicles.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, updateDoc, doc, where, query } from '@angular/fire/firestore';

@Component({
  selector: 'app-verify-vehicles',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verify-vehicles.component.html'
})
export class VerifyVehiclesComponent {
  firestore = inject(Firestore);
  vehicles$ = collectionData(
    query(collection(this.firestore, 'vehicles'), where('status', '==', 'pending')),
    { idField: 'id' }
  );

  approve(id: string) {
    updateDoc(doc(this.firestore, 'vehicles', id), { status: 'approved' });
  }

  reject(id: string) {
    updateDoc(doc(this.firestore, 'vehicles', id), { status: 'rejected' });
  }
}
