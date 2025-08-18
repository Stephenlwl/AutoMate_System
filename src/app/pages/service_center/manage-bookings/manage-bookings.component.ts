import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, updateDoc, doc, Timestamp } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, FormsModule } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-manage-bookings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './manage-bookings.component.html',
  styleUrl: './manage-bookings.component.css'
})
export class ManageBookingsComponent {
 private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);

  statuses = ['pending','confirmed','in_progress','completed','declined','cancelled'];
  statusFilter = '';
  bookings: any[] = [];
  technicians: any[] = [];
  bays: any[] = [];
  techMap: Record<string,string> = {};
  bayMap: Record<string,string> = {};

  showAssign = false;
  selectedBooking: any = null;
  assignForm = this.fb.group({
    technicianId: [''],
    bayId: [''],
    start: [''],
    notes: ['']
  });

  async ngOnInit() {
    await this.load();
    await this.loadTechniciansAndBays();
  }

  async load() {
    const email = this.auth.getEmail()!;
    const workshopId = await this.ctx.resolveWorkshopIdByEmail(email);
    if (!workshopId) return;

    const qBase = query(collection(this.fs, 'bookings'), where('workshopId', '==', workshopId));
    const s = await getDocs(qBase);
    let all = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (this.statusFilter) all = all.filter((b:any)=> b.status===this.statusFilter);
    this.bookings = all.sort((a:any,b:any)=> (b.createdAt?.toMillis()||0) - (a.createdAt?.toMillis()||0));
  }

  async loadTechniciansAndBays() {
    const email = this.auth.getEmail()!;
    const workshopId = await this.ctx.resolveWorkshopIdByEmail(email);
    if (!workshopId) return;

    const st = await getDocs(query(collection(this.fs,'staff'), where('workshopId','==',workshopId), where('role','==','technician'), where('active','==',true)));
    this.technicians = st.docs.map(d=>({ id:d.id, ...d.data() }));
    this.techMap = Object.fromEntries(this.technicians.map(t=>[t.id, t.name]));

    const ba = await getDocs(query(collection(this.fs,'bays'), where('workshopId','==',workshopId), where('active','==',true)));
    this.bays = ba.docs.map(d=>({ id:d.id, ...d.data() }));
    this.bayMap = Object.fromEntries(this.bays.map(b=>[b.id, b.name]));
  }

  async confirm(b:any) {
    await updateDoc(doc(this.fs,'bookings', b.id), { status: 'confirmed', updatedAt: Timestamp.now() });
    await this.load();
  }
  async decline(b:any) {
    await updateDoc(doc(this.fs,'bookings', b.id), { status: 'declined', updatedAt: Timestamp.now() });
    await this.load();
  }

  openAssign(b:any){ this.selectedBooking = b; this.showAssign = true; }
  closeAssign(){ this.showAssign = false; this.selectedBooking = null; this.assignForm.reset(); }

  async saveAssign() {
    if (!this.selectedBooking) return;
    const { technicianId, bayId, start, notes } = this.assignForm.value;
    await updateDoc(doc(this.fs,'bookings', this.selectedBooking.id), {
      assigned: {
        technicianId,
        bayId,
        start: start ? Timestamp.fromDate(new Date(start as string)) : null,
        notes: notes || ''
      },
      status: 'confirmed',
      updatedAt: Timestamp.now()
    });
    this.closeAssign();
    await this.load();
  }
}