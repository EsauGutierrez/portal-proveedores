import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from '../../lib/netsuite';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body;
    const tenant = await prisma.tenant.findUnique({where:{id:'cmmjsten00008v1t5xmyaw4ud'}});
    if(!tenant) return NextResponse.json({error: 'no tenant'}, {status:400});

    const creds = {
        accountId: tenant.netsuiteAccountId,
        consumerKey: tenant.netsuiteConsumerKey,
        consumerSecret: tenant.netsuiteConsumerSec,
        tokenId: tenant.netsuiteTokenId,
        tokenSecret: tenant.netsuiteTokenSecret
    };

    const res = await querySuiteQL(query, creds);
    return NextResponse.json({ success: true, count: res?.length || 0, data: res.slice(0, 10) });

  } catch(e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
