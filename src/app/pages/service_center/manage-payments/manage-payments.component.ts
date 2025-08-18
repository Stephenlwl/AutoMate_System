import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, updateDoc, doc, Timestamp } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-manage-payments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-payments.component.html',
  styleUrl: './manage-payments.component.css'
})
export class ServiceCenterPaymentsComponent {
private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  payments:any[]=[];

  async ngOnInit(){
    const wid = await this.ctx.resolveWorkshopIdByEmail(this.auth.getEmail()!);
    const s = await getDocs(query(collection(this.fs,'payments'), where('workshopId','==',wid)));
    this.payments = s.docs.map(d=>({ id:d.id, ...d.data() }));
  }
  async markStatus(p:any, status:'paid'|'refunded'){
    await updateDoc(doc(this.fs,'payments', p.id), { status, updatedAt: Timestamp.now() });
    p.status = status;
  }
}