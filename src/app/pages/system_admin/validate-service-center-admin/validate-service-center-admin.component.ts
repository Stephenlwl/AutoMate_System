import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-validate-service-center-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './validate-service-center-admin.component.html',
  styleUrls: ['./validate-service-center-admin.component.css']
})
export class ValidateServiceCenterAdminComponent implements OnInit {
  private firestore = inject(Firestore);

  pendingServiceCenters: any[] = [];
  respondedServiceCenters: any[] = [];
  loading = false;

  selectedServiceCenter: any = null;       
  selectedRejectId: string | null = null;
  rejectionReason: string = '';
  selectedAdminEmail: string = '';

  async ngOnInit() {
    await this.loadServiceCenters();
    await this.loadRespondedServiceCenters();
  }

  async loadServiceCenters() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'repair_service_centers'));
      this.pendingServiceCenters = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((serviceCenter: any) => serviceCenter.verification?.status === 'pending');
    } catch (error) {
      console.error('Error loading service center:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadRespondedServiceCenters() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'repair_service_centers'));
      this.respondedServiceCenters = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
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
      { label: 'SSM Document', url: docs.ssm || '' },
      { label: 'Service Center Photo', url: docs.serviceCenterPhoto || '' },
      { label: 'Business License', url: docs.businessLicense || '' },
      { label: 'Admin IC', url: docs.adminIC || '' }
    ];
  }

  isImage(file: string) {
    return file && !this.isPDF(file);
  }

  isPDF(file: string) {
    return file?.startsWith('data:application/pdf;base64,');
  }

  async approveApplication(serviceCenterId: string, adminEmail: string) {
    if (!confirm('Are you sure you want to approve this application?')) return;
    try {
      await updateDoc(doc(this.firestore, 'repair_service_centers', serviceCenterId), {
        'verification.status': 'approved',
        'verification.rejectionReason': ''
      });

      await fetch('http://localhost:3000/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: adminEmail,
          subject: 'Your Service Center Application Has Been Approved',
          text: `<p>Dear user,</p><p>Congratulations! Your service center account has been <b>verified successfully</b>.</p><p>You may now log in and start using the system.</p><p>Thank you.</p>`
        })
      });
      alert('The service center has been approved and an email notification sent.');
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
    if (!this.selectedRejectId || !this.rejectionReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }
    if (!confirm('Are you sure you want to reject this application?')) return;

    try {
      await updateDoc(doc(this.firestore, 'repair_service_centers', this.selectedRejectId), {
        'verification.status': 'rejected',
        'verification.rejectionReason': this.rejectionReason
      });
      // const service center= this.pendingServiceCenters.find(w => w.id === this.selectedRejectId);

      await fetch('http://localhost:3000/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: this.selectedAdminEmail,
          subject: 'Your Service Center Registration Has Been Rejected',
          text: `<p>Dear user,</p><p>We regret to inform you that your registration has been <b>rejected</b> for the following reason:</p><blockquote>${this.rejectionReason}</blockquote><p>Please revise your application and try again.</p>`
        })
      });

      alert('The service center has been rejected and an email notification sent.');
      this.selectedRejectId = null;
      this.loadServiceCenters();
      this.loadRespondedServiceCenters();
    } catch (error) {
      console.error('Error rejecting application:', error);
    }
  }
}
