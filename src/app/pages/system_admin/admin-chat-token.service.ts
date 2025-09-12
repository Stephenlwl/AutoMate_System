import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TokenResponse {
  token: string;
  apiKey: string;
}

@Injectable({ 
  providedIn: 'root' 
})
export class ChatTokenService {
  private tokenServerUrl = 'http://127.0.0.1:3000/token';

  constructor(private http: HttpClient) {}

  getToken(userId: string, name?: string): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(this.tokenServerUrl, { 
      userId, 
      name 
    });
  }
}