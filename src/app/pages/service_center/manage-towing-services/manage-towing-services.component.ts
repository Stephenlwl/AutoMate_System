import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, getDoc, updateDoc } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-manage-towing-services',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-towing-services.component.html',
  styleUrl: './manage-towing-services.component.css'
})
export class ManageTowingServicesComponent {
 private fs = inject(Firestore);
  private ctx = inject(ServiceCenterContextService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  opts = ['Vehicle Breakdown','Flat Tire / Tire Burst','Battery Dead','Locked Out / Lost Key','Accident / Collision','Engine Overheating / Engine Failure'];
  form = this.fb.group({ offers:[false], towingServices:[<string[]>[]], coverageKm:[25] });
  loaded=false; docId!:string;

  async ngOnInit(){
    const wid = await this.ctx.resolveServiceCenterIdByEmail(this.auth.getEmail()!);
    this.docId = wid!;
    const d = await getDoc(doc(this.fs,'service_centers', this.docId));
    const towing:any = d.data()?.['towing'] || {};
    this.form.patchValue({ offers: !!towing.offers, towingServices: towing.towingServices || [], coverageKm: towing.coverageKm || 25 });
    this.loaded = true;
  }
  toggle(e:any){ this.form.patchValue({ offers: e.target.checked }); }
  toggleSrv(name:string){
    const cur = new Set(this.form.value.towingServices as string[]);
    cur.has(name) ? cur.delete(name) : cur.add(name);
    this.form.patchValue({ towingServices: Array.from(cur) });
  }
  async save(){
    await updateDoc(doc(this.fs,'service_centers', this.docId), { towing: this.form.value });
    alert('Saved.');
  }
}