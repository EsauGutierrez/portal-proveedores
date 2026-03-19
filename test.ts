import { PrismaClient } from '@prisma/client';
import { querySuiteQL } from './src/app/lib/netsuite';

const prisma = new PrismaClient();

async function run() {
  const tenant = await prisma.tenant.findUnique({where:{id:'cmmjsten00008v1t5xmyaw4ud'}});
  if(!tenant) return;
  const creds = {
    accountId: tenant.netsuiteAccountId,
    consumerKey: tenant.netsuiteConsumerKey,
    consumerSecret: tenant.netsuiteConsumerSec,
    tokenId: tenant.netsuiteTokenId,
    tokenSecret: tenant.netsuiteTokenSecret
  };
  
  console.log("Fetching Transaction Header...");
  const t = await querySuiteQL("SELECT id, tranid, type, entity FROM transaction WHERE id = 103653", creds);
  console.log(t);

  console.log("Fetching Transaction Lines...");
  const tl = await querySuiteQL("SELECT id, mainline, item, createdfrom, itemsource FROM transactionline WHERE transaction = 103653", creds);
  console.log(tl);
  
  console.log("Fetching Previous Links...");
  const ptll = await querySuiteQL("SELECT * FROM PreviousTransactionLineLink WHERE nextdoc = 103653", creds);
  console.log(ptll);

}

run().then(() => console.log('Done')).catch(console.error);
