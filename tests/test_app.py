"""Tests for the Berber & Kuaför Randevu appointment system."""
import pytest
from datetime import date, timedelta

from app import app, db, Berber, Hizmet, Randevu


@pytest.fixture
def client():
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    app.config['WTF_CSRF_ENABLED'] = False

    with app.app_context():
        db.create_all()
        # Minimal seed
        berber = Berber(ad='Test Berber', uzmanlik='Berber', telefon='05001112233')
        kuafor = Berber(ad='Test Kuaför', uzmanlik='Kuaför', telefon='05002223344')
        hizmet_b = Hizmet(ad='Saç Kesimi', sure_dk=30, fiyat=100, uzmanlik='Berber')
        hizmet_k = Hizmet(ad='Saç Boyama', sure_dk=60, fiyat=300, uzmanlik='Kuaför')
        db.session.add_all([berber, kuafor, hizmet_b, hizmet_k])
        db.session.commit()

        with app.test_client() as c:
            yield c

        db.drop_all()


def tomorrow():
    return (date.today() + timedelta(days=1)).isoformat()


# ------------------------------------------------------------------
# Home page
# ------------------------------------------------------------------

def test_index_loads(client):
    rv = client.get('/')
    assert rv.status_code == 200
    assert 'Berber' in rv.data.decode('utf-8')


def test_index_lists_experts(client):
    rv = client.get('/')
    html = rv.data.decode('utf-8')
    assert 'Test Berber' in html
    assert 'Test Kuaför' in html


# ------------------------------------------------------------------
# Randevu Al page
# ------------------------------------------------------------------

def test_randevu_al_page_loads(client):
    rv = client.get('/randevu-al')
    assert rv.status_code == 200
    html = rv.data.decode('utf-8')
    assert 'Randevu Al' in html


def test_randevu_al_success(client):
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()

    rv = client.post('/randevu-al', data={
        'musteri_ad': 'Ali Veli',
        'musteri_telefon': '05001234567',
        'berber_id': berber.id,
        'hizmet_id': hizmet.id,
        'tarih': tomorrow(),
        'saat': '10:00',
        'notlar': '',
    }, follow_redirects=True)
    assert rv.status_code == 200
    html = rv.data.decode('utf-8')
    assert 'Ali Veli' in html


def test_randevu_al_missing_fields(client):
    rv = client.post('/randevu-al', data={}, follow_redirects=True)
    assert rv.status_code == 200
    html = rv.data.decode('utf-8')
    assert 'zorunludur' in html


def test_randevu_al_past_date_rejected(client):
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()

    dun = (date.today() - timedelta(days=1)).isoformat()
    rv = client.post('/randevu-al', data={
        'musteri_ad': 'Ali Veli',
        'musteri_telefon': '05001234567',
        'berber_id': berber.id,
        'hizmet_id': hizmet.id,
        'tarih': dun,
        'saat': '10:00',
    }, follow_redirects=True)
    assert rv.status_code == 200
    html = rv.data.decode('utf-8')
    assert 'Geçmiş' in html


def test_randevu_conflict_rejected(client):
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()
        bid = berber.id
        hid = hizmet.id

    payload = {
        'musteri_ad': 'Ali Veli',
        'musteri_telefon': '05001234567',
        'berber_id': bid,
        'hizmet_id': hid,
        'tarih': tomorrow(),
        'saat': '11:00',
    }
    client.post('/randevu-al', data=payload, follow_redirects=True)

    # Second booking at same slot should be rejected
    rv = client.post('/randevu-al', data=payload, follow_redirects=True)
    html = rv.data.decode('utf-8')
    assert 'zaten bir randevuya sahip' in html or 'farklı bir saat' in html


def test_randevu_conflict_rejected_for_confirmed(client):
    """Confirmed (Onaylandı) appointments should also block new bookings."""
    import datetime as dt
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()
        # Create a confirmed appointment directly
        r = Randevu(
            musteri_ad='Onaylı Müşteri',
            musteri_telefon='05001111111',
            berber_id=berber.id,
            hizmet_id=hizmet.id,
            tarih=date.today() + timedelta(days=5),
            saat=dt.time(13, 0),
            durum='Onaylandı',
        )
        db.session.add(r)
        db.session.commit()
        bid = berber.id
        hid = hizmet.id

    rv = client.post('/randevu-al', data={
        'musteri_ad': 'Başka Müşteri',
        'musteri_telefon': '05009998877',
        'berber_id': bid,
        'hizmet_id': hid,
        'tarih': (date.today() + timedelta(days=5)).isoformat(),
        'saat': '13:00',
    }, follow_redirects=True)
    html = rv.data.decode('utf-8')
    assert 'zaten bir randevuya sahip' in html or 'farklı bir saat' in html


# ------------------------------------------------------------------
# Randevu detail
# ------------------------------------------------------------------

def test_randevu_detay(client):
    import datetime as dt
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()
        r = Randevu(
            musteri_ad='Detay Test',
            musteri_telefon='05009999999',
            berber_id=berber.id,
            hizmet_id=hizmet.id,
            tarih=date.today() + timedelta(days=2),
            saat=dt.time(14, 0),
        )
        db.session.add(r)
        db.session.commit()
        rid = r.id

    rv = client.get(f'/randevu/{rid}')
    assert rv.status_code == 200
    assert 'Detay Test' in rv.data.decode('utf-8')


# ------------------------------------------------------------------
# Admin page
# ------------------------------------------------------------------

def test_admin_page_loads(client):
    rv = client.get('/admin')
    assert rv.status_code == 200
    assert 'Randevu' in rv.data.decode('utf-8')


def test_admin_status_update(client):
    import datetime as dt
    with app.app_context():
        berber = Berber.query.filter_by(uzmanlik='Berber').first()
        hizmet = Hizmet.query.filter_by(uzmanlik='Berber').first()
        r = Randevu(
            musteri_ad='Durum Test',
            musteri_telefon='05001111111',
            berber_id=berber.id,
            hizmet_id=hizmet.id,
            tarih=date.today() + timedelta(days=3),
            saat=dt.time(15, 0),
        )
        db.session.add(r)
        db.session.commit()
        rid = r.id

    rv = client.post(
        f'/admin/randevu/{rid}/durum',
        data={'durum': 'Onaylandı'},
        follow_redirects=True,
    )
    assert rv.status_code == 200

    with app.app_context():
        updated = db.session.get(Randevu, rid)
        assert updated.durum == 'Onaylandı'


# ------------------------------------------------------------------
# API endpoint
# ------------------------------------------------------------------

def test_api_hizmetler(client):
    rv = client.get('/api/hizmetler')
    assert rv.status_code == 200
    data = rv.get_json()
    assert 'hizmetler' in data
    assert len(data['hizmetler']) >= 1


def test_api_hizmetler_filtered(client):
    rv = client.get('/api/hizmetler?uzmanlik=Berber')
    assert rv.status_code == 200
    data = rv.get_json()
    for h in data['hizmetler']:
        assert h['uzmanlik'] in ('Berber', 'Her İkisi')
