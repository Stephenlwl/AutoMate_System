import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc } from '@angular/fire/firestore';

@Component({
  selector: 'app-manage-reviews',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './manage-review.component.css',
  templateUrl: './manage-review.component.html'
})
export class ManageReviewComponent {
  firestore = inject(Firestore);
  reviews$;

  constructor() {
    const ref = collection(this.firestore, 'reviews');
    const q = query(ref, where('status', '==', 'pending'));
    this.reviews$ = collectionData(q, { idField: 'id' });
  }

  remove(review: any) {
    deleteDoc(doc(this.firestore, 'reviews', review.id))
      .then(() => {
        alert('Review has been successfully removed');
      });
  }
}
