import { Component, inject, OnInit } from '@angular/core';
import { Firestore, getDocs, getDoc, updateDoc, doc } from '@angular/fire/firestore';
import { collection } from 'firebase/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Modal } from 'bootstrap';
import { RouterModule } from '@angular/router';
import * as CryptoJS from 'crypto-js';
import { environment } from '../../../../environments/environment.prod';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-validate-user-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule],
  templateUrl: './validate-user-accounts.component.html',
  styleUrl: './validate-user-accounts.component.css'
})

export class ValidateUserAccountsComponent implements OnInit {

  firestore = inject(Firestore);
  private http = inject(HttpClient);
  private carOwnerSecretKey = environment.encryptionCarOwnerKey;
  pendingUsers: any[] = [];
  approvedUsers: any[] = [];
  rejectedUsers: any[] = [];

  activeTab: 'pending' | 'approved' | 'rejected' = 'pending';

  previewUrl: string = '';
  previewTitle: string = '';
  selectedUser: any = null;
  carOwnerDetails: string = '';
  rejectionReason: string = '';
  loading = false;

  async ngOnInit() {
    await this.loadUserAccounts();
  }

  async loadUserAccounts() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'car_owners'));
      const allUsers = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

      this.pendingUsers = allUsers.filter((u: any) => u.verification?.status === 'pending');
      this.approvedUsers = allUsers.filter((u: any) => u.verification?.status === 'approved');
      this.rejectedUsers = allUsers.filter((u: any) => u.verification?.status === 'rejected');
    } catch (error) {
      console.error('Error loading user accounts:', error);
      alert('Failed to load user accounts: ' + error);
    } finally {
      this.loading = false;
    }
  }

  // convert CryptoJS WordArray to ArrayBuffer
  private wordArrayToArrayBuffer(wordArray: CryptoJS.lib.WordArray): ArrayBuffer {
    // convert wordArray to Latin1 string (1 char = 1 byte)
    const latin1 = CryptoJS.enc.Latin1.stringify(wordArray);

    // Turn string into Uint8Array
    const u8 = new Uint8Array(latin1.length);
    for (let i = 0; i < latin1.length; i++) {
      u8[i] = latin1.charCodeAt(i) & 0xff;
    }

    return u8.buffer;
  }

  isLikelyBase64(s: string): boolean {
    if (!s || typeof s !== 'string') return false;
    const cleaned = s.replace(/\s+/g, '');
    if (cleaned.length % 4 !== 0) return false;
    // character check
    return /^[A-Za-z0-9+/=]+$/.test(cleaned.slice(0, 64));
  }

  decryptFile(encryptedFile: string, ivStored: string, mimeType: string = 'image/jpeg'): string {
    if (!encryptedFile || !ivStored) return '';

    try {
      const key = CryptoJS.enc.Utf8.parse(this.carOwnerSecretKey || "X9f@3LpZ7qW!m2CkT8r#Jd6vNb^Hs4Y0");

      // parse IV as base64 if fails, treat IV as raw UTF-8 bytes.
      let iv: CryptoJS.lib.WordArray | null = null;
      try {
        iv = CryptoJS.enc.Base64.parse(ivStored);
        // sanity checking the base64-decoded IV should be 16 bytes
        if ((iv as any).sigBytes !== 16) {
          console.warn('decryptFile: parsed IV (base64) not 16 bytes:', (iv as any).sigBytes);
          iv = null;
        }
      } catch (e) {
        iv = null;
      }

      if (!iv) {
        // treat ivStored as UTF-8
        try {
          iv = CryptoJS.enc.Utf8.parse(ivStored);
          if ((iv as any).sigBytes !== 16) {
            console.warn('decryptFile: parsed IV (utf8) not 16 bytes:', (iv as any).sigBytes);
          }
        } catch (e) {
          console.error('decryptFile: cannot parse IV (neither base64 nor utf8):', e);
          return '';
        }
      }

      // build cipher params and decrypt
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(encryptedFile.replace(/\s+/g, '')),
      });

      const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      console.debug('decryptFile: decrypted hex (first 80 chars):', decrypted.toString(CryptoJS.enc.Hex).slice(0, 80));
      console.debug('decryptFile: decrypted base64 (first 80 chars):', decrypted.toString(CryptoJS.enc.Base64).slice(0, 80));

      // interpreting decrypted as UTF-8 base64 text encrypt base64 text flow
      try {
        const maybeText = CryptoJS.enc.Utf8.stringify(decrypted);
        if (maybeText && this.isLikelyBase64(maybeText)) {
          // plaintext was the base64 image string
          const cleaned = maybeText.replace(/\r?\n/g, '');
          return `data:${mimeType};base64,${cleaned}`;
        }
      } catch (e) {
        // ignore and fallback to raw bytes
        console.warn('decryptFile: UTF-8 stringify failed, falling back to raw bytes:', e);
      }

      const buf = this.wordArrayToArrayBuffer(decrypted);
      const blob = new Blob([buf], { type: mimeType || 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;


    } catch (err) {
      console.error('Decryption failed:', err);
      return '';
    }
  }

  getUsersByTab(): any[] {
    if (this.activeTab === 'approved') return this.approvedUsers;
    if (this.activeTab === 'rejected') return this.rejectedUsers;
    return this.pendingUsers;
  }

  async approveUserAccount(user: any, userEmail: string) {
    const userDoc = doc(this.firestore, 'car_owners', user.id);
    try {
      const userSnap = await getDoc(userDoc);
      const data: any = userSnap.data();
      const vehicles = data.vehicles || [];

      if (vehicles.length > 0) {
        vehicles[0] = { ...vehicles[0], status: 'approved' };
      }

      await updateDoc(userDoc, {
        'verification.status': 'approved',
        'verification.rejectionReason': '',
        'vehicles': vehicles
      }).then(() => {
        alert('You have successfully approved the user');
        this.pendingUsers = this.pendingUsers.filter(u => u.id !== user.id);
      });

      await this.http.post<any>(
        'http://localhost:3000/sendNotification/approve',
        { toEmail: userEmail }
      ).toPromise();

      alert('The car owner user has been approved and an email notification sent.');
    } catch (error) {
      console.error('Error approving application:', error);
    }

  }

  async rejectUser(user: any, reason: string, userEmail: string) {
    const userDoc = doc(this.firestore, 'car_owners', user.id);
    try {
      const userSnap = await getDoc(userDoc);
      const data: any = userSnap.data();
      const vehicles = data.vehicles || [];

      if (vehicles.length > 0) {
        vehicles[0] = { ...vehicles[0], status: 'rejected' };
      }

      updateDoc(userDoc, {
        'verification.status': 'rejected',
        'verification.rejectionReason': reason,
        'vehicles': vehicles
      }).then(() => {
        alert('You have successfully rejected the user');
        this.pendingUsers = this.pendingUsers.filter(u => u.id !== user.id);

      });

      await this.http.post<any>(
        'http://localhost:3000/sendNotification/reject',
        {
          toEmail: userEmail,
          rejectionReason: reason
        }
      ).toPromise();

      alert('The car owner user has been rejected and an email notification sent.');
    } catch (error) {
      console.error('Error rejecting application:', error);
    }

  }

  openPreview(encrypted: string, iv: string, mimeType: string, title: string, ownerName: string) {
    if (!encrypted || !iv) return;

    this.previewTitle = title;
    this.carOwnerDetails = ownerName;
    this.previewUrl = this.decryptFile(encrypted, iv, mimeType);
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
    this.rejectUser(this.selectedUser, this.rejectionReason, this.selectedUser.email);

    const modalElement = document.getElementById('rejectionReasonModal');
    if (modalElement) {
      const modal = Modal.getInstance(modalElement);
      modal?.hide();
    }
  }
}
