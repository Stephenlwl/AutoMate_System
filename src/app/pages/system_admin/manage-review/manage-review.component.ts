import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Firestore, collection, collectionData, query, where, deleteDoc, doc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { Modal } from 'bootstrap';

@Component({
  selector: 'app-manage-reviews',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styleUrl: './manage-review.component.css',
  templateUrl: './manage-review.component.html'
})
export class ManageReviewComponent implements OnInit {
  firestore = inject(Firestore);
  fb = inject(FormBuilder);
  
  reviews: any[] = [];
  selectedReview: any = null;
  isRemoving = false;
  removeForm!: FormGroup;
  private reviewsSubscription!: Subscription;
  private removeModal: Modal | null = null;

  constructor() {
    this.initializeForm();
  }

  ngOnInit() {
    this.loadReviews();
    setTimeout(() => {
      this.initializeModal();
    });
  }

  ngOnDestroy() {
    if (this.reviewsSubscription) {
      this.reviewsSubscription.unsubscribe();
    }
  }

  initializeForm() {
    this.removeForm = this.fb.group({
      reason: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  loadReviews() {
    const ref = collection(this.firestore, 'reviews');
    const q = query(ref, where('status', '==', 'approved'));
    
    this.reviewsSubscription = collectionData(q, { idField: 'id' }).subscribe({
      next: (reviews) => {
        this.reviews = reviews;
      },
      error: (error) => {
        console.error('Error loading reviews:', error);
        alert('Error loading reviews. Please try again.');
      }
    });
  }

  initializeModal() {
    const modalElement = document.getElementById('removeReviewModal');
    if (modalElement) {
      this.removeModal = new Modal(modalElement);
    }
  }

  openRemoveModal(review: any) {
    this.selectedReview = review;
    this.removeForm.reset();
    
    if (!this.removeModal) {
      this.initializeModal();
    }
    
    if (this.removeModal) {
      this.removeModal.show();
    } else {
      console.error('Modal not initialized');
      const modalElement = document.getElementById('removeReviewModal');
      if (modalElement) {
        const modal = new Modal(modalElement);
        modal.show();
      }
    }
  }

  async removeReview() {
    if (this.removeForm.invalid || !this.selectedReview) {
      return;
    }

    this.isRemoving = true;

    try {
      const removalData = {
        status: 'removed',
        removedAt: new Date(),
        removedReason: this.removeForm.get('reason')?.value,
        removedBy: 'system_admin'
      };

      // Update the review with removal information
      const reviewDocRef = doc(this.firestore, 'reviews', this.selectedReview.id);
      await updateDoc(reviewDocRef, removalData);

      // Hide modal
      if (this.removeModal) {
        this.removeModal.hide();
      }

      // Show success message
      alert('Review has been successfully removed');
      
      // Reset form and selected review
      this.removeForm.reset();
      this.selectedReview = null;

    } catch (error) {
      console.error('Error removing review:', error);
      alert('Error removing review. Please try again.');
    } finally {
      this.isRemoving = false;
    }
  }
  
}