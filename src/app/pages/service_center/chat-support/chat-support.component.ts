import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, query, where, orderBy, getDocs, addDoc, Timestamp, collectionGroup } from '@angular/fire/firestore';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { AuthService } from '../auth/service-center-auth';
import { ServiceCenterContextService } from '../auth/service-center-context';

@Component({
  selector: 'app-chat-support',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chat-support.component.html',
  styleUrl: './chat-support.component.css'
})
export class ServiceCenterChatComponent {
private fs = inject(Firestore);
  private auth = inject(AuthService);
  private ctx = inject(ServiceCenterContextService);
  private fb = inject(FormBuilder);

  threads:any[]=[]; messages:any[]=[]; activeThread:any=null;
  form = this.fb.group({ text:[''] });

  async ngOnInit(){
    const wid = await this.ctx.resolveServiceCenterIdByEmail(this.auth.getEmail()!);
    const s = await getDocs(query(collection(this.fs,'chats'), where('serviceCenterId','==',wid), orderBy('updatedAt','desc')));
    this.threads = s.docs.map(d=>({ id:d.id, ...d.data() }));
  }
  async open(i:number){
    this.activeThread = this.threads[i];
    const s = await getDocs(query(collection(this.fs,'chats', this.activeThread.id,'messages'), orderBy('createdAt','asc')));
    this.messages = s.docs.map(d=>d.data());
  }
  async send(){
    if (!this.activeThread || !this.form.value.text) return;
    await addDoc(collection(this.fs,'chats', this.activeThread.id,'messages'), {
      sender: 'serviceCenter', text: this.form.value.text, createdAt: Timestamp.now()
    });
    this.messages.push({ sender:'serviceCenter', text:this.form.value.text, createdAt: Timestamp.now() });
    this.form.reset();
  }
}