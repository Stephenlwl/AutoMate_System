import { Component, inject, OnInit } from '@angular/core';
import { Firestore, getDocs, getDoc, updateDoc, doc } from '@angular/fire/firestore';
import { collection } from 'firebase/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Modal } from 'bootstrap';
import { RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { environment } from '../../../../environments/environment.prod';
import * as CryptoJS from 'crypto-js';

interface Vehicle {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  carOwnerName?: string;
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  vin?: string;
  fuelType?: string;
  displacement?: string;
  sizeClass?: string;
  status: 'pending' | 'approved' | 'rejected';
  vocUrl: string;
  vocIv: string;
  vocType: string;
  submittedAt: any;
  reviewedAt?: any;
  adminNote?: string;
  vehicleIndex: number;
}

@Component({
  selector: 'app-verify-vehicles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, HttpClientModule],
  providers: [DatePipe],
  templateUrl: './verify-vehicles.component.html'
})
export class VerifyVehiclesComponent implements OnInit {
  firestore = inject(Firestore);
  private http = inject(HttpClient);
  private datePipe = inject(DatePipe);
  private carOwnerSecretKey = environment.encryptionCarOwnerKey;

  pendingVehicles: Vehicle[] = [];
  approvedVehicles: Vehicle[] = [];
  rejectedVehicles: Vehicle[] = [];

  activeTab: 'pending' | 'approved' | 'rejected' = 'pending';

  previewUrl: string = '';
  previewTitle: string = '';
  vehicleDetails: string = '';
  selectedVehicle: Vehicle | null = null;
  rejectionReason: string = '';
  loading = false;

  async ngOnInit() {
    await this.loadVehicles();
  }

  async loadVehicles() {
    this.loading = true;
    try {
      // Get all car owners
      const ownersSnapshot = await getDocs(collection(this.firestore, 'car_owners'));
      const allVehicles: Vehicle[] = [];

      for (const ownerDoc of ownersSnapshot.docs) {
        const ownerData = ownerDoc.data();
        const vehicles = ownerData['vehicles'] || [];

        for (let i = 0; i < vehicles.length; i++) {
          const vehicleData = vehicles[i];
          
          const vehicle: Vehicle = {
            id: ownerDoc.id,
            ownerId: ownerDoc.id,
            ownerName: ownerData['name'] || ownerData['fullName'] || 'Unknown Owner',
            ownerEmail: ownerData['email'] || 'No Email',
            ownerPhone: ownerData['phone'],
            carOwnerName: vehicleData['carOwnerName'] || 'Car Owner No Set',
            make: vehicleData['make'] || 'Unknown',
            model: vehicleData['model'] || 'Unknown',
            year: vehicleData['year']?.toString() || 'N/A',
            plateNumber: vehicleData['plateNumber'] || 'N/A',
            vin: vehicleData['vin'],
            fuelType: vehicleData['fuelType'],
            displacement: vehicleData['displacement'],
            sizeClass: vehicleData['sizeClass'],
            status: vehicleData['status'] || 'pending',
            vocUrl: vehicleData['vocUrl'] || '',
            vocIv: vehicleData['vocIv'] || '',
            vocType: vehicleData['vocType'] || 'image/jpeg',
            submittedAt: vehicleData['submittedAt'],
            reviewedAt: vehicleData['reviewedAt'],
            adminNote: vehicleData['adminNote'],
            vehicleIndex: i
          };

          allVehicles.push(vehicle);
        }
      }

      // Categorize vehicles by status
      this.pendingVehicles = allVehicles.filter(v => v.status === 'pending');
      this.approvedVehicles = allVehicles.filter(v => v.status === 'approved');
      this.rejectedVehicles = allVehicles.filter(v => v.status === 'rejected');

      console.log(`Loaded: ${this.pendingVehicles.length} pending, ${this.approvedVehicles.length} approved, ${this.rejectedVehicles.length} rejected`);

    } catch (error) {
      console.error('Error loading vehicles:', error);
      alert('Failed to load vehicles: ' + error);
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

  getVehiclesByTab(): Vehicle[] {
    switch (this.activeTab) {
      case 'approved': return this.approvedVehicles;
      case 'rejected': return this.rejectedVehicles;
      default: return this.pendingVehicles;
    }
  }

  async approveVehicle(vehicle: Vehicle) {
    if (!confirm(`Approve vehicle ${vehicle.plateNumber}?`)) return;

    try {
      const userDoc = doc(this.firestore, 'car_owners', vehicle.ownerId);
      const userSnap = await getDoc(userDoc);
      
      if (!userSnap.exists()) {
        alert('Owner document not found!');
        return;
      }

      const userData = userSnap.data();
      const vehicles = [...userData['vehicles']];
      
      // Update the specific vehicle status
      vehicles[vehicle.vehicleIndex] = {
        ...vehicles[vehicle.vehicleIndex],
        status: 'approved',
        approvedAt: new Date(),
        reviewedAt: new Date(),
        adminNote: null
      };

      await updateDoc(userDoc, {
        vehicles: vehicles
      });

      // Send notification email
      await this.http.post<any>('http://localhost:3000/sendVehicleNotification/vehicle-approved', {
        toEmail: vehicle.ownerEmail,
        plateNumber: vehicle.plateNumber,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        ownerName: vehicle.ownerName

      }).toPromise();

      // Update local state
      this.pendingVehicles = this.pendingVehicles.filter(v => 
        !(v.ownerId === vehicle.ownerId && v.vehicleIndex === vehicle.vehicleIndex)
      );
      this.approvedVehicles.push({...vehicle, status: 'approved', reviewedAt: new Date()});

      alert(`Vehicle ${vehicle.plateNumber} approved successfully!`);
      
    } catch (error) {
      console.error('Error approving vehicle:', error);
      alert('Failed to approve vehicle: ' + error);
    }
  }

  async rejectVehicle(vehicle: Vehicle, reason: string) {
    try {
      const userDoc = doc(this.firestore, 'car_owners', vehicle.ownerId);
      const userSnap = await getDoc(userDoc);
      
      if (!userSnap.exists()) {
        alert('Owner document not found!');
        return;
      }

      const userData = userSnap.data();
      const vehicles = [...userData['vehicles']];
      
      // Update the specific vehicle status
      vehicles[vehicle.vehicleIndex] = {
        ...vehicles[vehicle.vehicleIndex],
        status: 'rejected',
        reviewedAt: new Date(),
        adminNote: reason
      };

      await updateDoc(userDoc, {
        vehicles: vehicles
      });

      // Send rejection email
      await this.http.post<any>('http://localhost:3000/sendVehicleNotification/vehicle-rejected', {
        toEmail: vehicle.ownerEmail,
        plateNumber: vehicle.plateNumber,
        vehicle: `${vehicle.make} ${vehicle.model}`,
        rejectionReason: reason,
        ownerName: vehicle.ownerName
      }).toPromise();

      // Update local state
      this.pendingVehicles = this.pendingVehicles.filter(v => 
        !(v.ownerId === vehicle.ownerId && v.vehicleIndex === vehicle.vehicleIndex)
      );
      this.rejectedVehicles.push({
        ...vehicle, 
        status: 'rejected', 
        reviewedAt: new Date(),
        adminNote: reason
      });

      alert(`Vehicle ${vehicle.plateNumber} rejected successfully!`);
      
    } catch (error) {
      console.error('Error rejecting vehicle:', error);
      alert('Failed to reject vehicle: ' + error);
    }
  }

    openPreview(encrypted: string, iv: string, mimeType: string, title: string, details: string) {
    if (!encrypted || !iv) return;

    this.previewTitle = title;
    this.vehicleDetails = details;
    this.previewUrl = this.decryptFile(encrypted, iv, mimeType);
    const modal = new Modal(document.getElementById('imagePreviewModal')!);
    modal.show();
  }

  openRejectionModal(vehicle: Vehicle): void {
    this.selectedVehicle = vehicle;
    this.rejectionReason = '';

    const modalElement = document.getElementById('rejectionReasonModal');
    if (modalElement) {
      const modal = new Modal(modalElement, { backdrop: 'static' });
      modal.show();
    }
  }

  confirmRejection(): void {
    if (!this.rejectionReason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }

    if (!this.selectedVehicle) return;

    this.rejectVehicle(this.selectedVehicle, this.rejectionReason);

    const modalElement = document.getElementById('rejectionReasonModal');
    if (modalElement) {
      const modal = Modal.getInstance(modalElement);
      modal?.hide();
    }
  }

  // Utility method to format dates
  formatDate(date: any): string {
    if (!date) return 'N/A';
    
    if (date instanceof Date) {
      return this.datePipe.transform(date, 'medium') || 'Invalid Date';
    }
    
    if (date.toDate) {
      return this.datePipe.transform(date.toDate(), 'medium') || 'Invalid Date';
    }
    
    return 'Invalid Date';
  }
}