import { NextResponse } from 'next/server';

// Cette route servira de proxy vers le backend existant
export async function GET() {
  try {
    const response = await fetch('http://localhost:3001/state');
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch state' }, { status: 500 });
  }
}
