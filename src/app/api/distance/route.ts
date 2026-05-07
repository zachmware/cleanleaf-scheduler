import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { origin, destination } = await req.json();
    
    if (!origin || !destination) {
      return NextResponse.json({ minutes: 30 }); 
    }

    // Try both naming conventions just in case, including the user's custom MAPS_API
    const apiKey = process.env.MAPS_API || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.warn("NO API KEY DETECTED - USING FALLBACK GENERATOR");
      return NextResponse.json({ minutes: Math.min(120, Math.max(15, (origin.length + destination.length) * 3)) });
    }
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.rows && data.rows.length > 0 && data.rows[0].elements && data.rows[0].elements.length > 0) {
       const element = data.rows[0].elements[0];
       if (element.status === 'OK' && element.duration && typeof element.duration.value === 'number') {
           const seconds = element.duration.value;
           const minutes = Math.round(seconds / 60);
           return NextResponse.json({ minutes });
       }
    }
    
    // Default fallback if google cannot find path
    return NextResponse.json({ minutes: 45 });
  } catch (error) {
    console.error("Distance API Error", error);
    return NextResponse.json({ minutes: 45 });
  }
}
