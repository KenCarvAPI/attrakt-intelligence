import { prisma } from '@attrakt/core';

export default async function HomePage() {
  // Fetch key metrics (in production, use API routes)
  const clients = await prisma.client.findMany({
    include: {
      _count: {
        select: {
          members: true,
          threats: {
            where: {
              status: 'DETECTED',
            },
          },
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Attrakt Intelligence Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {clients.map((client) => (
            <div key={client.id} className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">{client.name}</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Members:</span>
                  <span className="font-medium">{client._count.members}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Active Threats:</span>
                  <span className="font-medium text-red-600">{client._count.threats}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/clients" className="p-4 border rounded hover:bg-gray-50">
              Clients
            </a>
            <a href="/members" className="p-4 border rounded hover:bg-gray-50">
              Members
            </a>
            <a href="/threats" className="p-4 border rounded hover:bg-gray-50">
              Threats
            </a>
            <a href="/reports" className="p-4 border rounded hover:bg-gray-50">
              Reports
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
