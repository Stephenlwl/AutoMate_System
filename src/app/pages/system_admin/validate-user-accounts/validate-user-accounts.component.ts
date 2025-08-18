import { Component, inject, OnInit } from '@angular/core';
import { Firestore, getDocs, updateDoc, doc } from '@angular/fire/firestore';
import { collection } from 'firebase/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Modal } from 'bootstrap';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-validate-user-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './validate-user-accounts.component.html',
  styleUrl: './validate-user-accounts.component.css'
})
export class ValidateUserAccountsComponent implements OnInit {

  firestore = inject(Firestore);
  loading = false;
  pendingUsers: any[] = [];
  previewUrl: string = '';
  previewTitle: string = '';
  selectedUser: any = null;
  rejectionReason: string = '';

  async ngOnInit() {
    await this.loadUserAccounts();
  }

  async loadUserAccounts() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'car_owners'));
      this.pendingUsers = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((user: any) => user.verification?.status === 'pending');
    } catch (error) {
      console.error('Error loading user accounts:', error);
      alert('error occur: ' + error || 'Failed to load user accounts');
    } finally {
      this.loading = false;
    }
  }

  approveUserAccount(user: any) {
    const userDoc = doc(this.firestore, 'car_owners', user.id);
    updateDoc(userDoc, {
      'verification.status': 'approved',
      'verification.rejectionReason': '',
      'vehicles.0.status': 'approved'
    }).then(() => {
      alert('You have successfully approved the user');
      this.pendingUsers = this.pendingUsers.filter(u => u.id !== user.id);
    });
  }

  rejectUser(user: any, reason: string) {
    const userDoc = doc(this.firestore, 'car_owners', user.id);
    updateDoc(userDoc, {
      'verification.status': 'rejected',
      'verification.rejectionReason': reason,
      'vehicles.0.status': 'rejected'
    }).then(() => {
      alert('You have successfully rejected the user');
      this.pendingUsers = this.pendingUsers.filter(u => u.id !== user.id);
    });
  }

  openPreview(imageUrl: string, title: string): void {
    this.previewUrl = imageUrl;
    this.previewTitle = title;
    const modal = new Modal(document.getElementById('imagePreviewModal')!);
    modal.show();
  }

  openRejectionModal(user: any): void {
    this.selectedUser = user;
    this.rejectionReason = '';

    const modalElement = document.getElementById('rejectionReasonModal');
    if (modalElement) {
      const modal = new Modal(modalElement, { backdrop: 'static' });
      modal.show();
    } else {
      console.error('Modal element still not found!');
    }
  }

  confirmRejection(): void {
    if (!this.rejectionReason.trim()) {
      alert('Please provide a reason for rejection to this user.');
      return;
    }
    this.rejectUser(this.selectedUser, this.rejectionReason);

    const modalElement = document.getElementById('rejectionReasonModal');
    if (modalElement) {
      const modal = Modal.getInstance(modalElement);
      modal?.hide();
    }
  }
}
