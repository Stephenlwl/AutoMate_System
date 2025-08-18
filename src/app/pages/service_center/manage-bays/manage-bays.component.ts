import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-manage-bays',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-bays.component.html',
  styleUrl: './manage-bays.component.css'
})
export class ManageBaysComponent {
 private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);

  bays:any[] = [];
  form = this.fb.group({ name:['', Validators.required], notes:[''] });

  async ngOnInit(){ await this.load(); }

  async load(){
    const workshopId = await this.ctx.resolveWorkshopIdByEmail(this.auth.getEmail()!);
    const s = await getDocs(query(collection(this.fs,'bays'), where('workshopId','==',workshopId)));
    this.bays = s.docs.map(d=>({id:d.id, ...d.data()}));
  }
  async create(){
    const workshopId = this.ctx.workshopId!;
    await addDoc(collection(this.fs,'bays'), { workshopId, name:this.form.value.name, notes:this.form.value.notes||'', active:true });
    this.form.reset();
    await this.load();
  }
  async toggle(b:any){
    await updateDoc(doc(this.fs,'bays', b.id), { active: !b.active });
    await this.load();
  }
}
