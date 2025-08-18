import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, getDocs, addDoc } from '@angular/fire/firestore';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import * as bcrypt from 'bcryptjs';

@Component({
  selector: 'app-manage-staff-towing-driver',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-staff-towing-driver.component.html',
  styleUrl: './manage-staff-towing-driver.component.css'
})
export class ManageStaffTowingDriverComponent {

 private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);

  tab:'staff'|'driver'='staff';
  staff:any[]=[]; drivers:any[]=[];
  staffForm = this.fb.group({ name:['',Validators.required], email:['', [Validators.required]], phone:['',Validators.required], role:['technician',Validators.required], password:['',Validators.required] });
  driverForm = this.fb.group({ name:['',Validators.required], email:['', [Validators.required]], phone:['',Validators.required], licenseNo:['',Validators.required], password:['',Validators.required] });

  async ngOnInit(){ await this.load(); }

  async load(){
    const wid = await this.ctx.resolveWorkshopIdByEmail(this.auth.getEmail()!);
    const s1 = await getDocs(query(collection(this.fs,'staff'), where('workshopId','==',wid)));
    this.staff = s1.docs.map(d=>d.data());
    const s2 = await getDocs(query(collection(this.fs,'towing_drivers'), where('workshopId','==',wid)));
    this.drivers = s2.docs.map(d=>d.data());
  }
  async createStaff(){
    const wid = this.ctx.workshopId!;
    const { password, ...rest } = this.staffForm.value;
    await addDoc(collection(this.fs,'staff'), { workshopId:wid, ...rest, passwordHash: await bcrypt.hash(password!,10), active:true });
    this.staffForm.reset({ role:'technician' });
    await this.load();
  }
  async createDriver(){
    const wid = this.ctx.workshopId!;
    const { password, ...rest } = this.driverForm.value;
    await addDoc(collection(this.fs,'towing_drivers'), { workshopId:wid, ...rest, passwordHash: await bcrypt.hash(password!,10), active:true });
    this.driverForm.reset();
    await this.load();
  }
}