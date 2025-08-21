import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Firestore, collection, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class ServiceCenterDashboardComponent {
 private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);

  cards = [
    { label: 'Pending Bookings', value: 0 },
    { label: 'Confirmed', value: 0 },
    { label: 'In Progress', value: 0 },
    { label: 'Completed (7d)', value: 0 },
  ];
  todayBookings: any[] = [];

  async ngOnInit() {
    const email = this.auth.getEmail()!;
    const serviceCenterId = await this.ctx.resolveServiceCenterIdByEmail(email);
    if (!serviceCenterId) return;

    const bkCol = collection(this.fs, 'bookings');

    // counts
    for (const [i, status] of ['pending', 'confirmed', 'in_progress'].entries()) {
      const q1 = query(bkCol, where('serviceCenterId', '==', serviceCenterId), where('status', '==', status));
      const s = await getDocs(q1);
      this.cards[i].value = s.size;
    }
    const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7*24*3600*1000));
    const q4 = query(bkCol, where('serviceCenterId', '==', serviceCenterId), where('status', '==', 'completed'), where('updatedAt', '>=', sevenDaysAgo));
    const s4 = await getDocs(q4);
    this.cards[3].value = s4.size;

    // today's bookings
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    const all = await getDocs(query(bkCol, where('serviceCenterId','==',serviceCenterId)));
    this.todayBookings = all.docs
      .map(d=>({ id:d.id, ...d.data() }))
      .filter((b:any)=> b.assigned?.start && b.assigned.start.toDate() >= start && b.assigned.start.toDate() <= end);
  }
}