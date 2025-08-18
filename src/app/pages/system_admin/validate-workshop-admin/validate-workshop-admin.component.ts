import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, updateDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-validate-workshop-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './validate-workshop-admin.component.html',
  styleUrls: ['./validate-workshop-admin.component.css']
})
export class ValidateWorkshopAdminComponent implements OnInit {
  private firestore = inject(Firestore);

  pendingWorkshops: any[] = [];
  respondedWorkshops: any[] = [];
  loading = false;

  selectedWorkshop: any = null;       
  selectedRejectId: string | null = null;
  rejectionReason: string = '';
  selectedAdminEmail: string = '';

  async ngOnInit() {
    await this.loadWorkshops();
    await this.loadRespondedWorkshops();
  }

  async loadWorkshops() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'repair_service_centers'));
      this.pendingWorkshops = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((workshop: any) => workshop.verification?.status === 'pending');
    } catch (error) {
      console.error('Error loading workshops:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadRespondedWorkshops() {
    this.loading = true;
    try {
      const snapshot = await getDocs(collection(this.firestore, 'repair_service_centers'));
      this.respondedWorkshops = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((workshop: any) => workshop.verification?.status !== 'pending');
    } catch (error) {
      console.error('Error loading responded workshops:', error);
    } finally {
      this.loading = false;
    }
  }

  viewWorkshopDetails(workshop: any) {
    this.selectedWorkshop = workshop;
  }

  getDocumentList(workshop: any) {
    const docs = workshop?.documents || {};
    return [
      { label: 'SSM Document', url: docs.ssm || '' },
      { label: 'Workshop Photo', url: docs.workshopPhoto || '' },
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

  async approveApplication(workshopId: string, adminEmail: string) {
    if (!confirm('Are you sure you want to approve this application?')) return;
    try {
      await updateDoc(doc(this.firestore, 'repair_service_centers', workshopId), {
        'verification.status': 'approved',
        'verification.rejectionReason': ''
      });

      await fetch('http://localhost:3000/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: adminEmail,
          subject: 'Your Workshop Application Has Been Approved',
          text: `<p>Dear user,</p><p>Congratulations! Your workshop account has been <b>verified successfully</b>.</p><p>You may now log in and start using the system.</p><p>Thank you.</p>`
        })
      });
      alert('The workshop has been approved and an email notification sent.');
      this.loadWorkshops();
      this.loadRespondedWorkshops
    } catch (error) {
      console.error('Error approving application:', error);
    }
  }

  openRejectModal(workshopId: string, adminEmail: string) {
    this.selectedRejectId = workshopId;
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
      // const workshop = this.pendingWorkshops.find(w => w.id === this.selectedRejectId);

      await fetch('http://localhost:3000/sendNotification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: this.selectedAdminEmail,
          subject: 'Your Workshop Registration Has Been Rejected',
          text: `<p>Dear user,</p><p>We regret to inform you that your registration has been <b>rejected</b> for the following reason:</p><blockquote>${this.rejectionReason}</blockquote><p>Please revise your application and try again.</p>`
        })
      });

      alert('The workshop has been rejected and an email notification sent.');
      this.selectedRejectId = null;
      this.loadWorkshops();
      this.loadRespondedWorkshops();
    } catch (error) {
      console.error('Error rejecting application:', error);
    }
  }
}
