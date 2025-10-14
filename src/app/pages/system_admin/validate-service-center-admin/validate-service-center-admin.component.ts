import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import * as CryptoJS from 'crypto-js';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-validate-service-center-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './validate-service-center-admin.component.html',
  styleUrls: ['./validate-service-center-admin.component.css']
})
export class ValidateServiceCenterAdminComponent implements OnInit {
  private firestore = inject(Firestore);
  private http = inject(HttpClient);
  private secretKey = environment.encryptionKey;

  pendingServiceCenters: any[] = [];
  respondedServiceCenters: any[] = [];
  loading = false;

  selectedServiceCenter: any = null;
  selectedRejectId: string | null = null;
  rejectionReason: string = '';
  selectedAdminEmail: string = '';
  approvedServiceCenters: any[] = [];
  rejectedServiceCenters: any[] = [];
  activeTab: 'pending' | 'approved' | 'rejected' = 'pending';

  loadingServiceCenterAction: string | null = null;
  loadingServiceCenterActionType: 'approve' | 'reject' | null = null;

  async ngOnInit() {
    await this.loadServiceCenters();
    await this.loadRespondedServiceCenters();
  }

  async loadServiceCenters() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'service_centers'));
      const all = snapshot.docs.map(docSnap => {
        const data: any = { id: docSnap.id, ...docSnap.data() };
        if (data.serviceCenterInfo?.registrationNumber) {
          data.serviceCenterInfo.registrationNumber = this.decryptText(data.serviceCenterInfo.registrationNumber);
        }
        return data;
      });

      this.pendingServiceCenters = all.filter((s: any) => s.verification?.status === 'pending');
      this.approvedServiceCenters = all.filter((s: any) => s.verification?.status === 'approved');
      this.rejectedServiceCenters = all.filter((s: any) => s.verification?.status === 'rejected');
    } finally {
      this.loading = false;
    }
  }

  getServiceCentersByTab() {
    if (this.activeTab === 'pending') return this.pendingServiceCenters;
    if (this.activeTab === 'approved') return this.approvedServiceCenters;
    if (this.activeTab === 'rejected') return this.rejectedServiceCenters;
    return [];
  }

  decryptText(encryptedText: string): string {
    if (!encryptedText) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.secretKey);
      return bytes.toString(CryptoJS.enc.Utf8); // safe for text
    } catch (err) {
      console.error("Decryption failed:", err);
      return '';
    }
  }

  async loadRespondedServiceCenters() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'service_centers'));
      this.respondedServiceCenters = snapshot.docs
        .map(docSnap => {
          const data: any = {
            id: docSnap.id, ...docSnap.data()
          };
          // decrypt registration number if exists
          if (data.serviceCenterInfo?.registrationNumber) {
            data.serviceCenterInfo.registrationNumber =
              this.decryptText(data.serviceCenterInfo.registrationNumber);
          }
          return data;
        })
        .filter((serviceCenter: any) => serviceCenter.verification?.status !== 'pending');
    } catch (error) {
      console.error('Error loading responded service center:', error);
    } finally {
      this.loading = false;
    }
  }

  viewServiceCenterDetails(serviceCenter: any) {
    this.selectedServiceCenter = serviceCenter;
  }

  getDocumentList(serviceCenter: any) {
    const docs = serviceCenter?.documents || {};
    return [
      { label: 'SSM Document', url: this.decryptFile(docs.ssm) },
      { label: 'Service Center Photo', url: this.decryptFile(docs.serviceCenterPhoto) },
      { label: 'Business License', url: this.decryptFile(docs.businessLicense) },
      { label: 'Admin IC', url: this.decryptFile(docs.adminIC) }
    ];
  }

  decryptFile(encryptedFile: string): string {
    if (!encryptedFile) return '';

    try {
      const bytes = CryptoJS.AES.decrypt(encryptedFile, this.secretKey);
      return bytes.toString(CryptoJS.enc.Utf8); // return full data URL (with mime)
    } catch (err) {
      console.error('Decryption failed:', err);
      return '';
    }
  }

  isImage(file: string) {
    return file && !this.isPDF(file);
  }

  isPDF(file: string) {
    return file?.startsWith('data:application/pdf;base64,');
  }

  async approveApplication(serviceCenterId: string, adminEmail: string) {
    this.loadingServiceCenterAction = serviceCenterId;
    this.loadingServiceCenterActionType = 'approve';

    if (!confirm('Are you sure you want to approve this application?')) return;

    try {
      await updateDoc(doc(this.firestore, 'service_centers', serviceCenterId), {
        'verification.status': 'approved',
        'verification.rejectionReason': ''
      });

      await this.http.post<any>(
        'http://localhost:3000/sendNotification/approve',
        { toEmail: adminEmail }
      ).toPromise();

      alert('The service center has been approved and an email notification sent.');
      this.loadingServiceCenterAction = null;
      this.loadingServiceCenterActionType = null;
      this.loadServiceCenters();
      this.loadRespondedServiceCenters();
    } catch (error) {
      console.error('Error approving application:', error);
    }
  }

  openRejectModal(serviceCenterId: string, adminEmail: string) {
    this.selectedRejectId = serviceCenterId;
    this.selectedAdminEmail = adminEmail;
    this.rejectionReason = '';
  }

  async rejectApplication() {
    this.loadingServiceCenterAction = this.selectedRejectId;
    this.loadingServiceCenterActionType = 'reject';

    if (!this.selectedRejectId || !this.rejectionReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    if (!confirm('Are you sure you want to reject this application?')) return;

    try {
      await updateDoc(doc(this.firestore, 'service_centers', this.selectedRejectId), {
        'verification.status': 'rejected',
        'verification.rejectionReason': this.rejectionReason
      });

      await this.http.post<any>(
        'http://localhost:3000/sendNotification/reject',
        {
          toEmail: this.selectedAdminEmail,
          rejectionReason: this.rejectionReason
        }
      ).toPromise();

      alert('The service center has been rejected and an email notification sent.');
      this.selectedRejectId = null;
      this.loadingServiceCenterAction = null;
      this.loadingServiceCenterActionType = null;
      this.loadServiceCenters();
      this.loadRespondedServiceCenters();
    } catch (error) {
      console.error('Error rejecting application:', error);
    }
  }
}
