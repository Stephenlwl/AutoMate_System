import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-manage-bays',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-bays.component.html',
  styleUrl: './manage-bays.component.css'
})
export class ManageBaysComponent {
 private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);

  bays:any[] = [];
  form = this.fb.group({ name:['', Validators.required], notes:[''] });

  async ngOnInit(){ await this.load(); }

  async load(){
    const serviceCenterId = await this.auth.getServiceCenterId();
    const s = await getDocs(query(collection(this.firestore,'bays'), where('serviceCenterId','==',serviceCenterId)));
    this.bays = s.docs.map(d=>({id:d.id, ...d.data()}));
  }
  async create(){
    const serviceCenterId = this.auth.getServiceCenterId();
    await addDoc(collection(this.firestore,'bays'), { serviceCenterId, name:this.form.value.name, notes:this.form.value.notes||'', active:true });
    this.form.reset();
    await this.load();
  }
  async toggle(b:any){
    await updateDoc(doc(this.firestore,'bays', b.id), { active: !b.active });
    await this.load();
  }
}
