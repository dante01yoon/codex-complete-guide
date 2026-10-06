import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).resolve().parents[1] / 'scripts/prepare_dashboard.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def charger(chger_id='01', **kwargs):
    return dict(statId='S1', chgerId=chger_id, statNm='충전소', addr='서울', lng='127', lat='37.5', zcode='11', stat='2', statUpdDt='20261005010000', **kwargs)


class AggregationTests(unittest.TestCase):
    def test_newest_update_wins_and_old_update_does_not_override(self):
        first, second = charger(), charger('02')
        updates = [
            dict(statId='S1', chgerId='01', stat='3', statUpdDt='20261005020000'),
            dict(statId='S1', chgerId='01', stat='4', statUpdDt='20261005013000'),
            dict(statId='S1', chgerId='02', stat='4', statUpdDt='20261005000000'),
        ]
        result = prepare.aggregate([first, second], updates)
        self.assertEqual(result['meta']['counts'], [1, 1, 0, 0])
        self.assertEqual(result['meta']['updatedChargers'], 1)
        self.assertEqual(result['stations'][0][5], [1, 1, 0, 0])
        self.assertEqual(first['stat'], '2')

    def test_classification(self):
        self.assertEqual([prepare.status_index(x) for x in ('2', '3', '4', '5', '1', '9', '', None)], [0, 1, 2, 2, 3, 3, 3, 3])

    def test_invalid_timestamp_and_missing_charger_are_ignored(self):
        result = prepare.aggregate([charger()], [
            dict(statId='S1', chgerId='01', stat='3', statUpdDt='bad'),
            dict(statId='S1', chgerId='99', stat='3', statUpdDt='20261005030000'),
        ])
        self.assertEqual(result['meta']['counts'], [1, 0, 0, 0])

    def test_invalid_coordinates_keep_counts(self):
        item = charger()
        item['lng'] = 'NaN'
        result = prepare.aggregate([item], [])
        self.assertEqual(result['meta']['unmappedStations'], 1)
        self.assertEqual(result['stations'][0][3:5], [None, None])
        self.assertEqual(result['meta']['chargerCount'], 1)

    def test_duplicates_and_other_regions(self):
        item = charger()
        copy = dict(item, stat='3', statUpdDt='20261005020000')
        other = dict(charger('02'), zcode='26')
        result = prepare.aggregate([item, copy, other], [])
        self.assertEqual(result['meta']['chargerCount'], 1)
        self.assertEqual(result['meta']['counts'], [0, 1, 0, 0])


if __name__ == '__main__':
    unittest.main()
